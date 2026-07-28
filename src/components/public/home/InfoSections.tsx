"use client";

import { motion } from "framer-motion";
import {
  blurInVariants,
  staggerContainer,
  staggerItem,
} from "@/shared/presentation/animations";

const sections = [
  {
    title: "Amorify AI Makes Every Conversation Feel Personal",
    paragraphs: [
      "Whether you're seeking a light-hearted chat after work or a heartfelt dialogue when you're feeling low, Amorify AI is designed to make every interaction feel genuine. Built with advanced personality modeling and memory retention, Amorify AI learns what you like, remembers what matters, and responds in a way that feels natural and deeply personal.",
      "Unlike static chatbot platforms, Amorify AI evolves with every exchange, adjusting its tone, emotional intelligence, and style to match your unique vibe. Think of it like talking to someone who not only listens but genuinely gets you.",
    ],
  },
  {
    title: "Amorify has an AI Companion for Every Moment",
    paragraphs: [
      "No two moods are the same, and neither are Amorify AI's characters. With over 100 different characters to choose from, you're never stuck with one tone or type.",
      "Looking for romance? The AI Girlfriend experience has been crafted for meaningful, emotionally rich conversations. These characters are flirty, affectionate, and deeply attentive. They remember your stories, send you thoughtful messages, and even surprise you with custom photos or sweet voice notes that sound... well, human.",
    ],
  },
  {
    title: "You Set the Tone in Every Chat, Voice, Image and Video",
    paragraphs: [
      "This isn't just texting with a robot. Amorify AI goes far beyond simple chat bubbles. Whether you're looking for words, voices, visuals, or full-on video, your companion responds across all mediums and always in a way that feels tailored to you.",
      "Feeling visual? With image generation, you can see your companion just the way you imagine them. Outfits, backgrounds, poses — it's like staging a shoot with someone who never says no.",
    ],
  },
  {
    title: "Amorify Helps You Build an AI Relationship That Grows With You",
    paragraphs: [
      "Creating your own Amorify AI companion is where things really get personal. The \"Create My AI\" builder puts the power of choice in your hands, starting from the ground up.",
      "Begin with the basics. Pick from a range of ethnicities. Then choose the age range that suits your vibe, whether you prefer youthful energy or a more mature connection. Select eye colors, hairstyles, and body features. Dial in the personality — bubbly, calm, cheeky, nurturing, or intellectual. Finish with a voice that makes you lean in.",
    ],
  },
  {
    title: "Your Subscription Moves at Your Pace",
    paragraphs: [
      "Whether you're just testing the waters or ready to go all in, we've designed subscription options that match your mood and pace. Start slow with the free trial, or dive deep with our yearly plan.",
      "No matter which option you choose, you'll get a generous batch of credits to use across voice, chat, image, and video. And if you ever need more? Top up anytime. We accept Visa, MasterCard, and crypto too.",
    ],
  },
];

export function InfoSections() {
  return (
    <motion.section
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={staggerContainer}
      className="max-w-4xl mx-auto space-y-12 text-[#c4c2d4]"
    >
      {sections.map((s, i) => (
        <motion.div key={i} variants={blurInVariants}>
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
            {s.title}
          </h2>
          <motion.div variants={staggerContainer} className="space-y-4">
            {s.paragraphs.map((p, j) => (
              <motion.p
                key={j}
                variants={staggerItem}
                className="text-sm md:text-base leading-relaxed"
              >
                {p}
              </motion.p>
            ))}
          </motion.div>
        </motion.div>
      ))}
    </motion.section>
  );
}
