import Link from "next/link";
import Image from "next/image";

export function Footer() {
  return (
    <footer className="border-t border-[#2a2a3d] bg-[#0a0a0f] py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-3">
              <Image src="/honey-bunny-logo.png" alt="Honey Bunny" width={28} height={28} className="rounded-lg" />
              <span className="font-bold text-gradient">Honey Bunny</span>
            </Link>
            <p className="text-sm text-[#6b7280] leading-relaxed">
              Your personalized AI companion experience. Chat, connect, and build meaningful bonds.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-sm font-semibold text-[#f1f0ff] mb-3">Product</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/pricing" className="text-sm text-[#6b7280] hover:text-[#c4c2d4] transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/signup" className="text-sm text-[#6b7280] hover:text-[#c4c2d4] transition-colors">
                  Get Started
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-sm font-semibold text-[#f1f0ff] mb-3">Company</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/safety" className="text-sm text-[#6b7280] hover:text-[#c4c2d4] transition-colors">
                  Safety
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-semibold text-[#f1f0ff] mb-3">Legal</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/terms" className="text-sm text-[#6b7280] hover:text-[#c4c2d4] transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-sm text-[#6b7280] hover:text-[#c4c2d4] transition-colors">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-[#2a2a3d] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[#4b5563]">
            © {new Date().getFullYear()} Honey Bunny. All rights reserved.
          </p>
          <p className="text-xs text-[#4b5563] text-center">
            This platform is for adults 18+ only. All companions are fictional AI characters.
          </p>
        </div>
      </div>
    </footer>
  );
}
