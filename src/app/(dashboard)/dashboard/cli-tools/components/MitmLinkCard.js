"use client";

import Link from "next/link";
import { Card } from "@/shared/components";
import Image from "next/image";

/**
 * Clickable card for MITM tools — navigates to /dashboard/mitm on click.
 */
export default function MitmLinkCard({ tool }) {
 return (
 <Link href="/dashboard/mitm" className="block">
 <Card padding="sm" className="overflow-hidden hover:border-primary/30 cursor-pointer">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="size-8 flex items-center justify-center shrink-0">
 <Image
 src={tool.image}
 alt={tool.name}
 width={32}
 height={32}
 className="size-8 object-contain rounded-sm"
 sizes="32px"
 onError={(e) => { e.target.style.display = "none"; }}
 loading="lazy"
 decoding="async"
 />
 </div>
 <div className="min-w-0">
 <div className="flex items-center gap-2">
 <h3 className="font-medium text-sm">{tool.name}</h3>
 <span className="px-1.5 py-1 text-[11px] font-medium bg-primary/10 text-primary rounded-sm">MITM</span>
 </div>
 <p className="text-xs text-text-muted truncate">{tool.description}</p>
 </div>
 </div>
 <span className="material-symbols-outlined text-text-muted text-[18px]">chevron_right</span>
 </div>
 </Card>
 </Link>
 );
}
