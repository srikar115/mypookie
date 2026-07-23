import Link from "next/link";
import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      {/* Simple nav */}
      <nav className="px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/honey-bunny-logo.png" alt="Honey Bunny" width={32} height={32} className="rounded-lg" />
          <span className="text-lg font-bold text-gradient">Honey Bunny</span>
        </Link>
      </nav>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        {children}
      </div>

      {/* Footer note */}
      <div className="px-6 py-4 text-center">
        <p className="text-xs text-[#4b5563]">
          Adults 18+ only · All companions are fictional AI characters
        </p>
      </div>
    </div>
  );
}
