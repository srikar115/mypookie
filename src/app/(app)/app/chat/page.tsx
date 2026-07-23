import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { MessageCircle, Plus, Sparkles } from "lucide-react";
import { timeAgo, truncate } from "@/lib/utils";

export const metadata = { title: "Chat" };

export default async function ChatIndexPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = session.user.id as string;

  const conversations = await prisma.conversation.findMany({
    where: { userId, status: "ACTIVE" },
    orderBy: { lastMessageAt: "desc" },
    take: 20,
    select: {
      id: true,
      lastMessageAt: true,
      companion: {
        select: {
          id: true,
          name: true,
          companionType: true,
          avatarUrl: true,
        },
      },
      messages: {
        take: 1,
        orderBy: { createdAt: "desc" },
        select: { content: true, role: true },
      },
    },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#fff8ee]">Chat</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">
            {conversations.length > 0
              ? `${conversations.length} conversation${conversations.length !== 1 ? "s" : ""}`
              : "Start a conversation"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {/* New chat card — always first, 9:16 aspect */}
        <Link href="/app/companions">
          <div className="group rounded-2xl border border-dashed border-amber-500/30 bg-amber-950/10 aspect-[9/16] flex flex-col items-center justify-center gap-2.5 p-4 hover:border-amber-400/50 hover:bg-amber-950/20 transition-all duration-200 cursor-pointer">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/20 border border-amber-500/30 group-hover:bg-amber-500/30 transition-colors">
              <Plus className="h-5 w-5 text-amber-400" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-amber-300 text-sm">New Chat</p>
              <p className="text-xs text-[#6b7280] mt-0.5">Choose a companion</p>
            </div>
          </div>
        </Link>

        {conversations.length === 0 ? (
          <div className="col-span-2 sm:col-span-2 rounded-xl border border-dashed border-[#2e2818] bg-[#12100a]/50 p-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 mx-auto mb-3">
              <Sparkles className="h-7 w-7 text-amber-400" />
            </div>
            <p className="text-sm font-medium text-[#fff8ee] mb-1">No conversations yet</p>
            <p className="text-xs text-[#6b7280]">
              Pick a companion from the card on the left to start chatting.
            </p>
          </div>
        ) : (
          conversations.map((conv) => {
            const lastMsg = conv.messages[0];
            const rawContent = lastMsg?.content;
            const lastText =
              typeof rawContent === "string"
                ? rawContent
                : rawContent
                ? JSON.stringify(rawContent)
                : null;
            const preview = lastText ? truncate(lastText, 65) : null;
            const isAssistant = lastMsg?.role === "ASSISTANT";

            return (
              <Link key={conv.id} href={`/app/chat/${conv.companion.id}`}>
                <div className="group rounded-2xl border border-[#2e2818] bg-[#12100a] overflow-hidden hover:border-amber-500/30 hover:shadow-lg hover:shadow-amber-500/10 transition-all duration-200 cursor-pointer">
                  {/* Avatar — 9:16 */}
                  <div className="relative aspect-[9/16] bg-gradient-to-br from-amber-950/40 to-rose-950/30 overflow-hidden">
                    {conv.companion.avatarUrl ? (
                      <Image
                        src={conv.companion.avatarUrl}
                        alt={conv.companion.name}
                        fill
                        className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
                        unoptimized
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-rose-400 text-3xl shadow-lg">
                          ✨
                        </div>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 px-3 pb-2 flex items-end justify-between">
                      <div>
                        <p className="font-bold text-white text-sm leading-tight">{conv.companion.name}</p>
                        {conv.companion.companionType && (
                          <p className="text-xs text-white/55">{conv.companion.companionType}</p>
                        )}
                      </div>
                      {conv.lastMessageAt && (
                        <span className="text-[10px] text-white/40 shrink-0 ml-1">
                          {timeAgo(conv.lastMessageAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Last message preview */}
                  <div className="px-3 py-2.5">
                    {preview ? (
                      <p className="text-xs text-[#9ca3af] line-clamp-2 leading-snug">
                        {isAssistant && (
                          <span className="text-[#6b7280] mr-1">{conv.companion.name}:</span>
                        )}
                        {preview}
                      </p>
                    ) : (
                      <p className="text-xs text-[#4b5563] italic">No messages yet</p>
                    )}

                    <div className="mt-2">
                      <Button size="sm" className="w-full">
                        <MessageCircle className="h-3.5 w-3.5" />
                        Continue
                      </Button>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
