import Link from "next/link";
import { Globe, MessageSquareText } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-[#1e1e26] bg-[#0a0a0f] mt-16">
      <div className="max-w-350 mx-auto px-4 md:px-6 lg:px-8 py-10 md:py-12">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8">
          {/* Brand */}
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-1.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-base font-bold">
                a
              </div>
              <span className="text-xl font-bold text-white">
                amorify<span className="text-pink-400">.ai</span>
              </span>
              <span className="text-pink-400 text-sm">®</span>
            </Link>

            <button className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#131318] border border-[#2a2a34] text-xs text-[#c4c2d4] hover:border-pink-500/40 transition-colors cursor-pointer">
              <Globe className="h-3.5 w-3.5" />
              English
            </button>

            <p className="text-sm text-[#8a8a99] leading-relaxed max-w-sm mb-4">
              Amorify AI powers immersive experiences that feel real, allowing
              users to generate images and create AI characters.
            </p>

            <div className="text-xs text-[#6b6b76] space-y-1">
              <p className="font-semibold text-[#c4c2d4]">Contacts:</p>
              <p>
                Amorify Limited, Nr. 000000
                <br />
                Business Centre, City, Country
              </p>
            </div>
          </div>

          {/* Features */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Features</h4>
            <ul className="space-y-2">
              <li>
                <Link
                  href="#"
                  className="text-sm text-[#8a8a99] hover:text-pink-400 transition-colors"
                >
                  Generate Image
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-sm text-[#8a8a99] hover:text-pink-400 transition-colors"
                >
                  Chat
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-sm text-[#8a8a99] hover:text-pink-400 transition-colors"
                >
                  Create Character
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-sm text-[#8a8a99] hover:text-pink-400 transition-colors"
                >
                  Gallery
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-sm text-[#8a8a99] hover:text-pink-400 transition-colors"
                >
                  My AI
                </Link>
              </li>
            </ul>
          </div>

          {/* Popular */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Popular</h4>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/"
                  className="text-sm text-[#8a8a99] hover:text-pink-400 transition-colors"
                >
                  Amorify AI
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-sm text-[#8a8a99] hover:text-pink-400 transition-colors"
                >
                  AI Girlfriend
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-sm text-[#8a8a99] hover:text-pink-400 transition-colors"
                >
                  AI Anime
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-sm text-[#8a8a99] hover:text-pink-400 transition-colors"
                >
                  AI Boyfriend
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal & Support */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">
              Legal &amp; Support
            </h4>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/terms"
                  className="text-sm text-[#8a8a99] hover:text-pink-400 transition-colors"
                >
                  Terms and Policies
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-sm text-[#8a8a99] hover:text-pink-400 transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/safety"
                  className="text-sm text-[#8a8a99] hover:text-pink-400 transition-colors"
                >
                  Safety
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-sm text-[#8a8a99] hover:text-pink-400 transition-colors"
                >
                  Help Center
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Company</h4>
            <ul className="space-y-2">
              <li>
                <Link
                  href="#"
                  className="text-sm text-[#8a8a99] hover:text-pink-400 transition-colors"
                >
                  We&apos;re hiring
                </Link>
              </li>
              <li>
                <Link
                  href="/pricing"
                  className="text-sm text-[#8a8a99] hover:text-pink-400 transition-colors"
                >
                  Pricing
                </Link>
              </li>
            </ul>

            <h4 className="text-sm font-semibold text-white mb-3 mt-6">Social</h4>
            <div className="flex gap-2">
              <Link
                href="#"
                aria-label="Discord"
                className="w-9 h-9 rounded-full bg-[#131318] border border-[#2a2a34] flex items-center justify-center text-pink-400 hover:border-pink-500/40 hover:bg-pink-500/10 transition-colors"
              >
                <MessageSquareText className="h-4 w-4" />
              </Link>
              <Link
                href="#"
                aria-label="X"
                className="w-9 h-9 rounded-full bg-[#131318] border border-[#2a2a34] flex items-center justify-center text-pink-400 hover:border-pink-500/40 hover:bg-pink-500/10 transition-colors"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-[#1e1e26] flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[#6b6b76]">
            © {new Date().getFullYear()} amorify.ai. All Rights Reserved -{" "}
            <Link href="#" className="hover:text-pink-400 transition-colors">
              Sitemap
            </Link>
          </p>

          <div className="flex items-center gap-3">
            <div className="text-[10px] font-bold px-2.5 py-1 rounded bg-blue-600 text-white">
              VISA
            </div>
            <div className="flex items-center">
              <div className="w-5 h-5 rounded-full bg-red-500" />
              <div className="w-5 h-5 rounded-full bg-yellow-500 -ml-2" />
            </div>
          </div>
        </div>

        <p className="text-center text-[10px] text-[#4b4b56] mt-6">
          This platform is for adults 18+ only. All companions are fictional AI
          characters.
        </p>
      </div>
    </footer>
  );
}
