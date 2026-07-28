# Chat Memory Architecture — Amorify

> Deep technical guide to how production AI companion apps store and use chat memory, and how we should build it for **Amorify**.
> Compiled 2026-07-27 from Mem0 docs, Replika/Character.AI/Nomi reverse-engineering, Redis RAG-at-scale guide, and the memory frameworks (MemGPT, Letta, LangGraph, Woven Imprint, Nūr, Sonzai).

---

## Table of Contents

1. [Why "just save chat history" is not memory](#1-why-just-save-chat-history-is-not-memory)
2. [The three-layer memory model](#2-the-three-layer-memory-model)
3. [How the big apps actually do it](#3-how-the-big-apps-actually-do-it)
4. [The extraction pipeline (writing memory)](#4-the-extraction-pipeline-writing-memory)
5. [The retrieval pipeline (reading memory)](#5-the-retrieval-pipeline-reading-memory)
6. [Storage backend choices](#6-storage-backend-choices)
7. [Recommended schema for Amorify](#7-recommended-schema-for-amorify)
8. [Concrete code flow](#8-concrete-code-flow)
9. [Latency & cost budgets](#9-latency--cost-budgets)
10. [Failure modes and mitigations](#10-failure-modes-and-mitigations)
11. [Privacy, retention, deletion](#11-privacy-retention-deletion)

---

## 1. Why "just save chat history" is not memory

The naive approach — save every message to Postgres, load the last 30 into the LLM context — is what **Character.AI** does, and it's why users describe it as **forgetful** ([Tendera's real-world test](https://medium.com/@billhongmoney/i-compared-every-ai-companions-memory-system-most-of-them-are-faking-it-1803d6d0243c)):

> _"Open a new chat with a character. Mention three specific things. Wait 48 hours. Come back and reference one of those details. Character.AI has absolutely no idea who you are. Every session starts from zero."_

Reasons the naive approach fails:

- **Context windows are bounded.** Even a 200K-token window can't hold months of chat for a long-term relationship.
- **Long context is expensive.** Every extra token in the prompt costs money at LLM inference time.
- **Long context is slow.** Attention scales with context length; TTFT jumps to 3–5s on 100K+ prompts.
- **Long context is noisy.** LLMs "lost-in-the-middle" — they attend heavily to the start and end, ignoring the middle. Stuffing raw chat produces worse recall than a distilled summary.
- **Old messages become junk.** 90% of raw chat is filler ("haha yeah", "interesting") that dilutes signal.

The fix: **distill chat into structured, retrievable, indexed facts**, and pull only what's relevant per turn.

---

## 2. The three-layer memory model

The de-facto standard for production AI companion memory:

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1 — Working Memory (short-term, ~100ms)                   │
│  • Last 10–30 raw messages                                       │
│  • Kept hot in Redis or Postgres                                 │
│  • Passed as-is into LLM prompt (recency)                        │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2 — Session Memory (mid-term, per-conversation)           │
│  • LLM-generated running summary of the current session          │
│  • Updated every N turns (e.g. every 20 messages)                │
│  • Compact — 200–500 tokens                                      │
│  • Bridges the gap when Layer 1 rolls off                        │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3 — Long-term Memory (permanent, cross-session)           │
│                                                                  │
│  3a. Semantic memory (vector store)                              │
│      • Individual facts, preferences, events                     │
│      • Each with an embedding for similarity search              │
│                                                                  │
│  3b. Structured profile (relational)                             │
│      • User's name, age, job, city, family, likes/dislikes       │
│      • Explicit key-value rows                                   │
│                                                                  │
│  3c. Relationship state                                          │
│      • Affinity scores per (user, character)                     │
│      • Milestones, ruptures, ongoing commitments                 │
│                                                                  │
│  3d. Episodic memory (optional)                                  │
│      • Compressed summaries of past sessions                     │
│      • "Last Tuesday we talked about your mom being in hospital" │
└─────────────────────────────────────────────────────────────────┘
```

Every LLM call assembles context from **all layers**, then generates a response. After the response, a **background job** writes back the new memories.

---

## 3. How the big apps actually do it

Reverse-engineered from public docs, help articles, and user tests.

### 3.1 Character.AI

- **Sliding context window only.** No cross-session memory by default.
- "Persona / Pinned Description" — a user-editable text box injected into every prompt. It's a **user-authored note**, not something the AI extracts.
- Vector search rumored to be used for some experiences (roleplay stories) but not the default.
- Verdict: **forgets everything between sessions** by design.

### 3.2 Replika

- **Memory tab** — visible, editable, structured entries: name, job, birthday, pet name, preferences. User can view/delete individual entries.
- **Diary entries** — atmospheric AI-generated reflections (not factual recall).
- **Relationship tier** — persistent (Friend, Girlfriend, etc.), unlocked by leveling.
- **Chat history** — retained on servers but only recent conversations fit in active context; older stuff falls out silently.
- Verdict: **Solid on explicit facts, weak on emotional recall.** Users report *"she remembers my dog's name but not that my mom was in the hospital last week."*
- Layer usage: 1 (context window) + 3b (structured profile). No true vector memory in the standard product.

### 3.3 Nomi

- Marketed as "best memory in the space" — extensive fact extraction with semantic recall.
- Uses per-user × per-character memory scoping.
- Confirmed vector search + structured facts hybrid.

### 3.4 Candy.ai

- Confirmed **long-term memory works across languages** ([Erosiab review](https://erosiab.com/en/candy-ai-review/)).
- Extracts facts from chat + generates images/videos with consistent character identity.
- Details of storage not public, but behavior matches a **Mem0-style extraction + hybrid retrieval** pattern.

### 3.5 AIKO (Olympus Studio)

- 70B parameter local model + **semantic memory that keeps important facts indefinitely**.
- Older chat gets **compressed over time** (episodic summarization).
- 3D life-sim overlay with needs (hunger, energy) — memory extends beyond chat.

### 3.6 Infrastructure-only players

| Product | Pattern |
|---|---|
| [Mem0](https://mem0.ai) | Managed extract + retrieve API. v3 uses ADD-only extraction + multi-signal hybrid search |
| [MemGPT / Letta](https://github.com/cpacker/MemGPT) | Two-tier: core memory (small, hot) + recall memory (paged in via function calls) |
| [Woven Imprint](https://github.com/virtaava/woven-imprint) | Five emotional dimensions (trust, affection, respect, familiarity, tension) + constraint tiers |
| [Nūr](https://github.com/balfiky/nur) | Adds "identity continuity" (constitution, drives) + "relational continuity" (ruptures, repairs, commitments) |
| [Sonzai](https://sonz.ai/engine) | "Relationship Layer" — memory + Big Five personality drift + 4D mood + per-user retrieval |

**Common pattern:** all serious memory engines separate the **LLM (stateless generator)** from **state (persistent, structured, indexed)**. The LLM is a black box you can swap; the state is the source of truth.

---

## 4. The extraction pipeline (writing memory)

This is the "what should I remember about this turn?" step. It runs **after** the LLM has responded to the user.

### 4.1 Naive vs smart

**Naive:** save every message as a chat log row. Result: raw noise, no retrievability.

**Smart (Mem0 v3 pattern):**

```
1. Take the new turn (user + assistant messages)
2. Retrieve top-10 related existing memories (dedup context)
3. Single LLM call: "extract new facts, preferences, decisions, plans, events"
4. Compute embeddings + MD5 hash for each extracted fact
5. Deduplicate against existing memories (skip if hash matches)
6. Store new facts with metadata: user_id, character_id, category, valence, source_message_id
```

### 4.2 What to extract

Prioritize these categories:

| Category | Example | Why |
|---|---|---|
| Identity facts | "User's name is Alex", "Alex works as a software engineer" | Core recall |
| Preferences | "Hates cilantro", "Loves horror movies" | Adds personality color |
| Relationships | "Has a dog named Max", "Mom's name is Sarah, is in hospital" | Emotional resonance |
| Events / plans | "Going to Tokyo next month", "Anniversary is Nov 12" | Time-sensitive callback |
| Emotional state | "Had a bad week", "Excited about promotion" | Empathy fuel |
| Opinions | "Thinks the boss is a jerk", "Believes in cryptocurrency" | Sustained personality view |
| Commitments made by AI | "I promised to remind them about their meeting Tuesday" | Trust anchor |

### 4.3 What NOT to extract

- Filler ("lol", "yeah", "ok")
- Prompted questions the user isn't answering ("what do you like?" → nothing to store)
- Sensitive credentials (passwords, SSN, financial details) — actively strip
- Contradictions to existing facts — flag as **conflict** for review, don't silently overwrite

### 4.4 ADD-only vs UPDATE/DELETE

Two schools:

- **UPDATE model** (Mem0 v2, MemGPT) — the extractor also decides to update or delete existing memories. Higher intelligence, but the extraction LLM makes mistakes and destroys history.
- **ADD-only model** (Mem0 v3, most 2026 systems) — every new fact is appended with a timestamp. The retrieval layer resolves conflicts by preferring recent + high-confidence.

**Recommendation for Amorify:** ADD-only. Never lose data. Handle conflict at retrieval time by taking the most recent (or highest-valence) fact.

### 4.5 Fact schema

```jsonc
{
  "id": "uuid",
  "user_id": "uuid",
  "character_id": "uuid",  // NULL for user-global facts
  "content": "User's dog is named Max, a golden retriever",
  "category": "relationship",  // enum
  "valence": 0.7,               // -1..1, emotional charge
  "confidence": 0.9,            // 0..1, extractor certainty
  "source_message_id": "uuid",  // where it came from
  "extracted_at": "timestamp",
  "embedding": "vector(1536)",
  "entities": ["Max", "dog"],   // for entity-boosted retrieval
  "expires_at": null,           // for time-limited facts ("visiting NYC this weekend")
  "metadata": { "explicit": false }  // vs explicitly told
}
```

### 4.6 Extraction model choice

Extraction runs on **every turn** in the background. Cost adds up fast.

| Model | Cost per 1M input tokens | Quality | Notes |
|---|---|---|---|
| GPT-4o-mini | $0.15 | Good | Cheap, fast, reliable JSON |
| Claude Haiku 4 | $0.25 | Very good | Better nuance |
| GPT-5-mini | $0.30 | Excellent | Mem0's default |
| Llama 3.1 8B (self-hosted) | ~$0.05 | Fair | Cheap if you have GPUs |
| DeepSeek-V3 | $0.14 | Very good | Best price/quality in 2026 |

**Recommendation for Amorify:** GPT-4o-mini or DeepSeek-V3 in production. Mock extractor for dev.

**Batching:** extract every N turns instead of every turn to cut cost by ~4×. Trade-off: memory lag.

---

## 5. The retrieval pipeline (reading memory)

This runs **before** the LLM call, on every user message.

### 5.1 The pipeline

```
user_message
    ↓
1. Preprocess (lemmatize keywords, extract entity mentions)
    ↓
2. Parallel retrieval (fan out to all layers)
    ├─ 2a. Semantic search:      pgvector cosine on embedding(user_message) → top-20 candidates
    ├─ 2b. BM25 keyword search:  full-text on content → boost signal (not new candidates)
    ├─ 2c. Entity match:         WHERE 'Max' = ANY(entities) → boost signal
    ├─ 2d. Recency boost:        exponential decay on extracted_at
    ├─ 2e. Structured facts:     always-include profile row (name, age, etc.)
    └─ 2f. Relationship state:   always-include affinity row for THIS character
    ↓
3. Score fusion → top-K (usually K=5)
    ↓
4. Optional cross-encoder rerank on top-20 for better relevance
    ↓
5. Assemble prompt:
   [ system_prompt (persona + appearance) ]
   [ relationship_state (tier, affinity, mood) ]
   [ structured_facts (name, key preferences) ]
   [ session_summary (Layer 2) ]
   [ relevant_memories (top-K from Layer 3a) ]
   [ recent_messages (last 20 from Layer 1) ]
   [ new_user_message ]
    ↓
LLM.stream()
```

### 5.2 Hybrid retrieval is non-negotiable

Pure vector search fails when the user asks specific questions:

> "What's my dog's name?"

Vector search returns memories about "dogs" and "pets" in general, but may miss the exact fact _"User's dog is named Max"_ if the phrasing is different. **BM25** (keyword) catches the literal "dog's name" phrasing, and **entity matching** boosts anything mentioning "Max". Fusion of the three signals is what makes recall reliable.

Mem0 v3's implementation is the reference: BM25 and entity scores are **boost signals** (not recall expanders) — only semantic candidates are considered, but their ranking is shifted by keyword + entity overlap.

### 5.3 Filter scoping (multi-tenancy)

Always scope every retrieval with `user_id`. Optionally also with `character_id` for per-companion memory isolation, or leave `character_id IS NULL` for shared user-global facts (their name, job, etc. should be known to every companion).

```sql
-- User × character semantic search
SELECT id, content, embedding <=> $query_embedding AS distance
FROM memory_facts
WHERE user_id = $user
  AND (character_id = $character OR character_id IS NULL)
  AND (expires_at IS NULL OR expires_at > NOW())
ORDER BY distance
LIMIT 20;
```

### 5.4 Recency weighting

Fresh memories should outrank old ones when scores are close. Simple exponential decay:

```
final_score = semantic_score
            + w_bm25 * bm25_score
            + w_entity * entity_score
            + w_recency * exp(-age_in_days / 90)
```

Typical weights: `w_bm25=0.3`, `w_entity=0.4`, `w_recency=0.2`.

---

## 6. Storage backend choices

### 6.1 Vector store options

| Option | Pros | Cons | When to pick |
|---|---|---|---|
| **pgvector** (Postgres) | Same DB as everything else; no sync issues; ACID; free | Slower at 10M+ vectors; needs HNSW/IVFFlat tuning | **Default for Amorify** — we're already on Postgres |
| Pinecone | Zero-ops, fast, managed | Extra vendor + cost | Enterprise scale, no ops team |
| Qdrant | Fast, filtered queries, self-host | Extra service | Big scale + heavy filtering |
| Weaviate | Built-in hybrid search | Complex ops | You want hybrid out of the box |
| Redis Vector | Sub-ms latency, in-memory | Expensive at scale | Ultra-low-latency needs |

**Amorify recommendation:** **pgvector** in the existing `mypookie` Postgres. Add `CREATE EXTENSION vector;` and use `HNSW` index on the embedding column.

### 6.2 Working memory (Layer 1)

Options:

- **Postgres** — simplest, join with everything. Add a `messages` table with `(user_id, character_id, conversation_id, role, content, created_at)`.
- **Redis** — faster reads (~1ms vs 5–20ms), but requires eviction policy and a separate service. Only justified at millions of daily active users.

**Amorify recommendation:** Postgres for v1. Migrate to Redis for hot-path if latency becomes a bottleneck.

### 6.3 Embedding model

| Model | Dims | Cost per 1M tokens | Notes |
|---|---|---|---|
| `text-embedding-3-small` (OpenAI) | 1536 | $0.02 | Cheap, common, Mem0 default |
| `text-embedding-3-large` (OpenAI) | 3072 | $0.13 | Higher quality, 2× cost |
| `gte-Qwen2-1.5B` (Alibaba, open) | 1536 | ~$0 self-host | Best open-source retrieval |
| Cohere embed-v3 | 1024 | $0.10 | Good multilingual |
| Voyage voyage-3 | 1024 | $0.06 | Best English retrieval quality |

**Amorify recommendation:** `text-embedding-3-small` for v1. Swap to Voyage or Qwen if quality plateaus.

**Consistency rule:** never mix embedding models across the same index. If you migrate, re-embed everything.

---

## 7. Recommended schema for Amorify

To be added when we build the next migration. Draft for `.agents/docs/schema.md`:

```prisma
model MemoryFact {
  id              String   @id @default(uuid())
  userId          String   @map("user_id")
  characterId     String?  @map("character_id")     // null = user-global
  content         String                             // the extracted fact
  category        MemoryCategory
  valence         Float    @default(0)              // -1..1 emotional charge
  confidence      Float    @default(0.8)            // 0..1 extractor certainty
  sourceMessageId String?  @map("source_message_id")
  extractedAt     DateTime @default(now())
  expiresAt       DateTime?
  entities        String[]                          // for entity-boosted retrieval
  metadata        Json     @default("{}")
  embedding       Unsupported("vector(1536)")?      // pgvector column

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  character Companion? @relation(fields: [characterId], references: [id], onDelete: Cascade)
  sourceMessage Message? @relation(fields: [sourceMessageId], references: [id])

  @@index([userId, characterId])
  @@index([userId, extractedAt])
  @@index([entities], type: Gin)
  // HNSW index on embedding added manually via migration SQL
  @@map("memory_facts")
}

enum MemoryCategory {
  IDENTITY        // name, age, job, location
  PREFERENCE      // likes/dislikes
  RELATIONSHIP    // family, friends, pets, partners
  EVENT           // things that happened
  PLAN            // future intentions
  EMOTION         // moods, feelings
  OPINION         // beliefs, viewpoints
  COMMITMENT      // promises made by AI
  OTHER
}

model RelationshipState {
  id              String   @id @default(uuid())
  userId          String   @map("user_id")
  characterId     String   @map("character_id")

  // Five bounded emotional axes (Woven Imprint pattern)
  trust           Float    @default(50) // 0..100
  affection       Float    @default(50)
  respect         Float    @default(50)
  familiarity     Float    @default(0)
  tension         Float    @default(0)

  // Aggregate affinity (derived, cached)
  affinity        Float    @default(0)
  tier            RelationshipTier @default(STRANGER)

  lastInteractionAt DateTime @default(now())
  totalMessages     Int      @default(0)
  streakDays        Int      @default(0)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  character Companion @relation(fields: [characterId], references: [id], onDelete: Cascade)

  @@unique([userId, characterId])
  @@map("relationship_states")
}

enum RelationshipTier {
  STRANGER
  ACQUAINTANCE
  FRIEND
  CLOSE_FRIEND
  ROMANTIC_INTEREST
  PARTNER
  SOULMATE
}

model RelationshipMilestone {
  id              String   @id @default(uuid())
  userId          String   @map("user_id")
  characterId     String   @map("character_id")
  type            String                              // "first_message", "first_kiss", "birthday_remembered"
  content         String                              // human-readable description
  occurredAt      DateTime @default(now())
  metadata        Json     @default("{}")

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  character Companion @relation(fields: [characterId], references: [id], onDelete: Cascade)

  @@index([userId, characterId, occurredAt])
  @@map("relationship_milestones")
}

model ConversationSummary {
  id              String   @id @default(uuid())
  conversationId  String   @unique @map("conversation_id")
  summary         String                              // running LLM summary (Layer 2)
  turnsCovered    Int      @default(0)
  updatedAt       DateTime @updatedAt

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@map("conversation_summaries")
}
```

**Manual SQL to add after `prisma migrate`:**

```sql
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE memory_facts
  ADD COLUMN embedding vector(1536);

CREATE INDEX memory_facts_embedding_idx
  ON memory_facts
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- BM25 via pg_trgm + tsvector (or use ParadeDB for real BM25 support)
CREATE INDEX memory_facts_content_gin
  ON memory_facts
  USING gin(to_tsvector('english', content));
```

---

## 8. Concrete code flow

### 8.1 On new user message

```ts
// POST /api/chat/[conversationId]/stream

export async function POST(req: Request, { params }: { params: { conversationId: string } }) {
  const session = await auth();
  const { content } = await req.json();

  // 1. Persist user message
  const userMsg = await db.message.create({
    data: { conversationId: params.conversationId, role: 'USER', content, userId: session.user.id }
  });

  // 2. Moderation gate
  const flagged = await moderationService.checkInput(content);
  if (flagged.blocked) return blockedResponse(flagged);

  // 3. Assemble context (retrieval)
  const context = await assembleContext({
    userId: session.user.id,
    characterId: conversation.companionId,
    conversationId: params.conversationId,
    query: content,
  });

  // 4. Deduct credits + start stream
  await creditService.deduct(session.user.id, 1, 'chat_message');
  const stream = await providerRouter.streamChat({
    systemPrompt: context.systemPrompt,
    memoryContext: context.memoryContext,
    recentMessages: context.recentMessages,
    userMessage: content,
  });

  // 5. Stream to client
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let full = '';
      for await (const chunk of stream) {
        full += chunk;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: chunk })}\n\n`));
      }
      controller.close();

      // 6. Persist assistant message
      const asstMsg = await db.message.create({
        data: { conversationId: params.conversationId, role: 'ASSISTANT', content: full }
      });

      // 7. Kick off background jobs (fire-and-forget)
      after(() => extractAndSaveMemories(userMsg, asstMsg, context));
      after(() => updateRelationshipState(session.user.id, conversation.companionId, userMsg, asstMsg));
      after(() => maybeUpdateSessionSummary(params.conversationId));
    },
  });

  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream' } });
}
```

### 8.2 Context assembler

```ts
async function assembleContext({ userId, characterId, conversationId, query }: Ctx) {
  const [profile, relationship, summary, semanticFacts, recent, character] = await Promise.all([
    // 3b. Structured profile — always included
    db.userProfile.findUnique({ where: { userId } }),

    // 3c. Relationship state — always included
    db.relationshipState.findUnique({ where: { userId_characterId: { userId, characterId } } }),

    // 2. Session summary
    db.conversationSummary.findUnique({ where: { conversationId } }),

    // 3a. Semantic + BM25 + entity retrieval
    hybridSearch(query, { userId, characterId, topK: 5 }),

    // 1. Working memory (raw recent messages)
    db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }).then(m => m.reverse()),

    db.companion.findUnique({ where: { id: characterId } }),
  ]);

  return {
    systemPrompt: buildSystemPrompt(character, relationship),
    memoryContext: formatMemoryBlock({ profile, relationship, summary, semanticFacts }),
    recentMessages: recent,
  };
}
```

### 8.3 Hybrid search implementation

```ts
async function hybridSearch(
  query: string,
  { userId, characterId, topK }: Filters
): Promise<MemoryFact[]> {
  const queryEmbedding = await embed(query);
  const queryEntities = extractEntities(query);

  // Single SQL that combines all three signals + recency
  const results = await db.$queryRaw<Array<MemoryFact & { score: number }>>`
    SELECT
      f.*,
      (
        (1 - (f.embedding <=> ${queryEmbedding}::vector))                                    -- semantic (cosine)
        + 0.3 * COALESCE(ts_rank(to_tsvector('english', f.content), plainto_tsquery(${query})), 0) -- bm25 boost
        + 0.4 * (CASE WHEN f.entities && ${queryEntities}::text[] THEN 1 ELSE 0 END)          -- entity boost
        + 0.2 * exp(-EXTRACT(EPOCH FROM (NOW() - f.extracted_at)) / (86400 * 90))             -- recency (90-day half-life)
      ) AS score
    FROM memory_facts f
    WHERE f.user_id = ${userId}::uuid
      AND (f.character_id = ${characterId}::uuid OR f.character_id IS NULL)
      AND (f.expires_at IS NULL OR f.expires_at > NOW())
    ORDER BY score DESC
    LIMIT ${topK}
  `;

  return results;
}
```

### 8.4 Background extraction

```ts
async function extractAndSaveMemories(
  userMsg: Message,
  asstMsg: Message,
  context: AssembledContext,
) {
  // Retrieve top-10 related existing memories (for dedup context)
  const existingRelated = await hybridSearch(userMsg.content, {
    userId: userMsg.userId,
    characterId: context.characterId,
    topK: 10,
  });

  // Single LLM call — extract new facts as JSON
  const prompt = buildExtractionPrompt(userMsg, asstMsg, existingRelated);
  const raw = await llm.generate({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    responseFormat: 'json_object',
  });

  const extracted = ExtractionSchema.parse(JSON.parse(raw));

  // Dedup by MD5 hash, then batch insert
  for (const fact of extracted.facts) {
    const hash = md5(fact.content);
    const exists = await db.memoryFact.findFirst({
      where: { userId: userMsg.userId, characterId: context.characterId, metadata: { path: ['hash'], equals: hash } }
    });
    if (exists) continue;

    const embedding = await embed(fact.content);

    await db.$executeRaw`
      INSERT INTO memory_facts (id, user_id, character_id, content, category, valence, confidence, source_message_id, entities, metadata, embedding)
      VALUES (${uuid()}, ${userMsg.userId}::uuid, ${context.characterId}::uuid, ${fact.content}, ${fact.category}::memorycategory, ${fact.valence}, ${fact.confidence}, ${userMsg.id}::uuid, ${fact.entities}::text[], ${JSON.stringify({ hash })}::jsonb, ${embedding}::vector)
    `;
  }
}
```

### 8.5 Extraction prompt (drop-in template)

```
You are a memory extraction system for a personalized AI companion.

Given the following exchange between a user and their companion, extract NEW durable facts about the user that should be remembered for future conversations.

USER MESSAGE: {user_message}
COMPANION RESPONSE: {assistant_message}

EXISTING RELATED MEMORIES (do NOT re-extract these):
{existing_memories_bulleted}

Extract facts in the following categories:
- IDENTITY: name, age, job, location, gender, physical traits
- PREFERENCE: likes, dislikes, favorites
- RELATIONSHIP: family, friends, pets, partners (with names when known)
- EVENT: things that happened to the user
- PLAN: future intentions or scheduled events (include expires_at if time-bound)
- EMOTION: significant emotional states shared by the user
- OPINION: beliefs, viewpoints, values
- COMMITMENT: promises the companion made to the user

Rules:
- Only extract facts explicitly stated by the user, not inferred.
- Skip fillers ("lol", "yeah", "ok") and questions the user didn't answer.
- Redact sensitive data: passwords, credit card numbers, SSN, exact addresses.
- If a new fact contradicts an existing memory, still extract it — mark contradicts: [id].
- Return JSON: { "facts": [{ "content": "...", "category": "...", "valence": -1..1, "confidence": 0..1, "entities": ["..."], "expires_at": null | ISO date }] }
- Return empty array if nothing worth extracting.
```

---

## 9. Latency & cost budgets

### 9.1 Per-turn latency target

For chat UX, users tolerate up to ~1.5s time-to-first-token. Budget:

| Step | Time | Notes |
|---|---|---|
| Auth + rate limit | 5–10ms | Redis / DB lookup |
| Moderation input | 50–100ms | OpenAI Moderation or hosted classifier |
| Assemble context (5 parallel queries) | 80–150ms | Bottleneck: pgvector query |
| Embedding query | 30–50ms | OpenAI embeddings API |
| **Sub-total (pre-LLM)** | **200–350ms** | |
| LLM stream start (TTFT) | 400–800ms | Fast model (Haiku, GPT-4o-mini) |
| **Total TTFT** | **600–1150ms** | ✅ acceptable |

Anything over 1.5s TTFT and users start typing "hello?" or refreshing.

### 9.2 Per-turn cost target

For a healthy unit economy at $5.99–$12.99/mo unlimited chat:

| Step | Cost per turn |
|---|---|
| Embedding (query, ~50 tokens) | $0.000001 |
| Chat LLM (context ~2K tokens + response ~200 tokens, GPT-4o-mini) | $0.0004 |
| Background extraction (context ~1K + JSON ~300, GPT-4o-mini) | $0.0002 |
| Embedding (extracted facts, ~200 tokens) | $0.000004 |
| **Total** | **~$0.0006/turn** |

At 100 turns/day per user: **$0.06/user/day** → ~$1.80/mo. Plenty of margin under a $6/mo sub.

At scale (10K DAU, 100 turns each): $600/day AI compute. Doable.

### 9.3 Storage cost

Per user with ~1000 memory facts of ~100 chars + 1536-dim float32 embedding:

- Text: 100KB
- Embeddings: 6.1 MB
- Total: ~6.2 MB / user

10K users = 62 GB. pgvector-friendly on a $200/mo managed Postgres.

---

## 10. Failure modes and mitigations

| Failure | Symptom | Mitigation |
|---|---|---|
| Extractor hallucinates facts | "She remembers me saying I have a sister — I don't have a sister" | Set `confidence` threshold, filter <0.7 out of retrieval; user can delete via memory UI |
| Contradiction (user changes job) | AI thinks user is a chef when they're now a lawyer | ADD-only + recency weight in retrieval; expose "correct me" flow that adds high-confidence override |
| Memory bloat | 100K facts per user, retrieval slow, quality drops | Compression job: after N months, LLM merges related facts into summaries; hard cap per user |
| Cross-user leakage | User A sees a memory that belongs to User B | Always scope by `user_id` in the WHERE clause; test with a synthetic multi-tenant fuzz suite |
| Filler pollution | "haha", "yeah" ends up as extracted facts | Extractor prompt filters; low `confidence` threshold; monthly manual audit |
| Extraction cost explosion | LLM bill spirals as users get chatty | Batch extract every N turns (5–10); switch to cheaper model at high message volume |
| pgvector slow at scale | p99 query >500ms above 5M rows | Partition `memory_facts` by `user_id % 32`; migrate to Qdrant if still slow |
| Sensitive data leak (users vent about jobs, health) | User sees PII in their own memory tab and freaks out | Redact SSN/CC/passwords in extractor prompt; expose memory UI so users can delete |
| Embedding drift | New embedding model produces incomparable vectors | Never mix models in one index; version the index, migrate atomically |
| GDPR deletion request | User wants everything erased | `ON DELETE CASCADE` from User → MemoryFact ensures wipe on account deletion |

---

## 11. Privacy, retention, deletion

### 11.1 What's stored

- Chat messages (Layer 1): full raw text
- Session summaries (Layer 2): LLM-compressed
- Extracted facts (Layer 3a/3b): distilled, structured
- Relationship state: aggregate numeric scores + tier
- Milestones: timestamps + short human-readable strings

### 11.2 What's NOT stored

- Passwords / credentials the user might paste (extractor redacts)
- Payment details (Stripe holds them)
- Audio blobs of voice calls (transcribed and discarded after N days by default)
- Video frames (stored only if generation output; not user video input)

### 11.3 User-facing controls (industry expectation, 2026 laws)

Every serious AI companion app in 2026 offers:

- **Memory browser** — view all extracted facts about you
- **Delete individual memory** — one-click removal
- **Delete all memories** — reset the AI to zero
- **Export memories** — GDPR portability
- **Pause memory extraction** — chat without building state (temporary "incognito" mode)

### 11.4 Retention policy (recommended default)

| Data type | Default retention | User override |
|---|---|---|
| Raw chat messages | 90 days | User can extend or shorten |
| Session summaries | Indefinite | User can delete session |
| Memory facts | Indefinite | User can delete individually |
| Voice call transcripts | 30 days | User can extend |
| Voice call audio | 24h then discard | Never persisted long |
| Moderation events | 7 years (legal) | Cannot delete |

### 11.5 Encryption

- At rest: managed Postgres with disk encryption (AES-256).
- Column-level encryption for `content` (chat messages, extracted facts): optional, cost is that you can't do server-side full-text search. Trade-off. Most apps skip this and rely on DB-level encryption + strict access.
- In transit: TLS 1.3 everywhere. HSTS on. No mixed content.

---

## Appendix — Sources

- Mem0 how-it-works — https://docs.mem0.ai/core-concepts/how-it-works
- Mem0 v3 architecture — https://github.com/mem0ai/mem0/blob/HEAD/skills/mem0/references/architecture.md
- Mem0 blog: how memory works in chatbots — https://mem0.ai/blog/how-memory-works-in-ai-chatbots
- AI Chatbot Memory Architecture in 2026 (Dev.to) — https://dev.to/david_chejo/ai-chatbot-memory-architecture-in-2026-rag-long-context-and-hybrid-approaches-compared-g47
- getclaw memory guide — https://getclaw.sh/blog/adding-memory-to-conversational-ai-companion
- Redis RAG at Scale — https://redis.io/blog/rag-at-scale/
- ai-companion (reference OSS impl) — https://github.com/kailash-turimella/ai-companion
- pgvector + Mem0 + LangChain production guide — https://python.elitedev.in/large_language_model/how-to-build-production-ready-llm-memory-system/
- Replika memory (official) — https://help.replika.com/hc/en-us/articles/37208679176077-How-does-Replika-s-memory-work
- Replika memory field notes — https://thredly.io/replika-memory
- Character.AI vs Replika vs Nomi comparison — https://aicompanionpick.com/character-ai-vs-replika-vs-nomi-memory-comparison
- Tendera memory-system reality check — https://medium.com/@billhongmoney/i-compared-every-ai-companions-memory-system-most-of-them-are-faking-it-1803d6d0243c
- Why Character.AI forgets you (Dev.to) — https://dev.to/kinthai/why-characterai-forgets-you-and-what-persistent-memory-actually-requires-1b23
- Woven Imprint — https://github.com/virtaava/woven-imprint
- Nūr — https://github.com/balfiky/nur
- Sonzai — https://sonz.ai/engine
