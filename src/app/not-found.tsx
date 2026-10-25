import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf6f1] px-6">
      <div className="text-center max-w-md">
        <p className="font-display text-7xl font-bold text-[#b76e79]">404</p>
        <h1 className="font-display text-2xl font-semibold text-[#2b211b] mt-4">
          This page stepped out for a trim.
        </h1>
        <p className="text-[#8a7a6d] mt-3 leading-relaxed">
          The address you tried doesn&apos;t exist — or it moved and didn&apos;t leave
          a note at the front desk.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-full bg-[#b76e79] text-white px-7 py-3 mt-8 text-sm font-semibold hover:bg-[#a55e6a] transition-colors"
        >
          Back to the salon
        </Link>
      </div>
    </div>
  );
}
