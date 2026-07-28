"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/shared/presentation/utils";
import {
  blurInVariants,
  staggerContainer,
  staggerItem,
  TRANSITION_SMOOTH,
} from "@/shared/presentation/animations";

const faqs = [
  {
    q: "What is Amorify AI?",
    a: "Amorify.ai is a premium AI companion app, letting you create personalized virtual companions or connect instantly with our realistic AI characters in immersive, uncensored fantasy experiences — all within a safe and private space.",
  },
  {
    q: "Is Amorify AI legitimate and safe to use?",
    a: "Yes, Amorify AI is a legitimate service. It employs encrypted transactions, adheres to GDPR-compliant data privacy standards, and uses discreet billing methods to ensure user safety and confidentiality.",
  },
  {
    q: "How will Amorify AI appear on my bank statements?",
    a: "Transactions are processed securely and appear under a neutral merchant name. There is no direct reference to Amorify AI or its services on your bank statement, ensuring user privacy.",
  },
  {
    q: "Can I customize my Amorify AI experience?",
    a: "Yes, Amorify AI offers robust customization options. Users can design their own companions through the \"Create My AI\" feature, selecting preferences such as ethnicity, hairstyle, voice, personality traits, and more.",
  },
  {
    q: "Who uses Amorify AI and for what purpose?",
    a: "Amorify AI attracts a wide range of users. Some seek companionship or emotional support, while others use it for storytelling, creative writing, or roleplay. Additionally, AI enthusiasts explore it to better understand conversational AI capabilities.",
  },
  {
    q: "What is an AI Companion and can I create my own?",
    a: "An AI Companion is a virtual character powered by artificial intelligence that can converse, respond to emotional cues, and evolve with ongoing interactions. With Amorify AI, users can fully personalize their companion's appearance, behavior, and preferences.",
  },
  {
    q: "Can my AI Companion send images, video, or voice messages?",
    a: "Yes, Amorify AI supports multimodal interaction. Your companion can engage in voice conversations, generate personalized images, and appear in AI-generated videos tailored to your inputs and preferences.",
  },
  {
    q: "Can I roleplay with my AI Companion?",
    a: "Absolutely. Amorify AI supports a wide variety of roleplay scenarios, ranging from casual interactions and narrative development to immersive storytelling. The AI adapts dynamically to user prompts and themes.",
  },
];

export function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <motion.section
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={blurInVariants}
      className="max-w-3xl mx-auto"
    >
      <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
        <span className="text-white">Amorify AI</span>{" "}
        <span className="text-pink-400">FAQ</span>
      </h2>

      <motion.div
        className="space-y-2"
        variants={staggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-40px" }}
      >
        {faqs.map((faq, i) => {
          const isOpen = open === i;
          return (
            <motion.div
              key={i}
              variants={staggerItem}
              className={cn(
                "rounded-xl border overflow-hidden transition-colors",
                isOpen
                  ? "border-pink-500/40 bg-[#161620]"
                  : "border-[#2a2a34] bg-[#131318] hover:border-[#3a3a4a]"
              )}
            >
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="w-full flex items-center justify-between text-left px-5 py-4 cursor-pointer"
              >
                <h3 className="text-sm md:text-base font-semibold text-white pr-4">
                  {faq.q}
                </h3>
                <motion.div
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={TRANSITION_SMOOTH}
                  className="flex-shrink-0"
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-colors",
                      isOpen ? "text-pink-400" : "text-[#8a8a99]"
                    )}
                  />
                </motion.div>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{
                      height: TRANSITION_SMOOTH,
                      opacity: { duration: 0.25 },
                    }}
                    className="overflow-hidden"
                  >
                    <p className="px-5 pb-4 text-sm text-[#c4c2d4] leading-relaxed">
                      {faq.a}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </motion.div>
    </motion.section>
  );
}
