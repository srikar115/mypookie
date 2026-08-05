import {
  decideOpenerFromTurns,
  type OpenerTurn,
} from "../src/modules/chat/domain/opener-policy";

const t = (s: string) => new Date(`2026-08-04T${s}Z`);
const u = (at: string, content: string): OpenerTurn => ({
  role: "user",
  content,
  at: t(at),
});
const a = (at: string, content: string): OpenerTurn => ({
  role: "assistant",
  content,
  at: t(at),
});

// The real thread, replayed. Every assistant row below with no user message
// before it is an opener that actually fired in production.
const thread: OpenerTurn[] = [
  a("09:24:28", "Hey there, cutie. You new around here?"),
  a("09:24:35", "Thought you might've forgotten about me."),
  a("09:24:42", "Hey stranger, long time no chat."),
  a("09:24:47", "Hey Karthik, so... what have you been up to?"),
  a("09:24:55", "Hey there, cutie. You new around here?"),
  a("09:25:05", "Hey there, stranger. Long time no chat."),
  u("09:25:26", "hello babe"),
  a("09:25:31", "Thought you might've forgotten about me."),
  u("09:26:14", "when we met last time in gym right"),
  a("09:26:17", "Hey stranger, long time no chat."),
  u("09:26:53", "hello where we met last time"),
  a("09:26:59", "Hey Karthik, so... what have you been up to?"),
  a("09:27:15", "Hey there, stranger. Long time no chat."),
];

// At each point an opener actually fired, would the policy allow it now?
const firings = [
  { at: "09:24:28", upto: 0, note: "first ever — thread empty" },
  { at: "09:24:35", upto: 1, note: "stacked on opener #1" },
  { at: "09:24:42", upto: 2, note: "stacked on opener #2" },
  { at: "09:24:47", upto: 3, note: "stacked on opener #3" },
  { at: "09:24:55", upto: 4, note: "stacked on opener #4" },
  { at: "09:25:05", upto: 5, note: "stacked on opener #5" },
  { at: "09:27:15", upto: 12, note: "16s after a real reply" },
  { at: "09:45:35", upto: 12, note: "18min after a real reply" },
  { at: "09:55:12", upto: 13, note: "stacked on the 09:45 opener" },
];

// 09:45 / 09:55 need the tail rows the abbreviated thread above omits.
thread.push(a("09:45:35", "Hey there, stranger. Long time no chat."));

console.log("replaying the 9 openers that actually fired:\n");
let allowed = 0;
for (const f of firings) {
  const d = decideOpenerFromTurns(thread.slice(0, f.upto), t(f.at));
  if (d.warranted) allowed++;
  console.log(
    `${f.at}  ${d.warranted ? "ALLOW " : `refuse(${d.reason})`.padEnd(30)}  ${f.note}`,
  );
}
console.log(`\n${allowed}/9 would fire now (was 9/9)`);

// Direct cases.
console.log("\ndirect cases:");
const cases: Array<[string, OpenerTurn[], string, boolean]> = [
  ["empty thread", [], "09:00:00", true],
  ["user awaiting reply", [u("08:59:00", "hi")], "09:00:00", false],
  [
    "fresh reply, user just spoke",
    [u("08:59:00", "hi"), a("08:59:05", "hey you")],
    "09:00:00",
    false,
  ],
  // The threshold is four hours. Ten minutes is a coffee, not an absence —
  // speaking first there is what made the character seem to forget the
  // conversation it was already having.
  [
    "answered exchange 10min ago — still the same sitting",
    [u("08:49:00", "hi"), a("08:49:05", "hey you")],
    "09:00:00",
    false,
  ],
  [
    "answered exchange 5h ago — genuinely away",
    [u("04:00:00", "hi"), a("04:00:05", "hey you")],
    "09:00:00",
    true,
  ],
  [
    "cold, but tail is an unanswered opener",
    [u("08:30:00", "hi"), a("08:30:05", "hey you"), a("08:40:00", "still there?")],
    "09:00:00",
    false,
  ],
  [
    "media placeholder in flight",
    [u("08:49:00", "send a pic"), a("08:49:01", "")],
    "09:00:00",
    false,
  ],
];
let failed = 0;
for (const [name, turns, now, want] of cases) {
  const d = decideOpenerFromTurns(turns, t(now));
  const ok = d.warranted === want;
  if (!ok) failed++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  want=${want ? "allow" : "refuse"} got=${d.warranted ? "allow" : `refuse(${d.reason})`}  ${name}`,
  );
}
process.exit(failed > 0 ? 1 : 0);
