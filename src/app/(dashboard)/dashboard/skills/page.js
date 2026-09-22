"use client";

import { Card, Badge } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import {
 SKILLS,
 SKILLS_REPO_URL,
 getSkillRawUrl,
 getSkillBlobUrl,
} from "@/shared/constants/skills";

function CopyButton({ value, label = "Copy link" }) {
 const { copied, copy } = useCopyToClipboard(2000);
 return (
 <button
 onClick={() => copy(value)}
 className="px-2 h-8 rounded-sm bg-primary text-white text-xs font-medium hover:bg-primary/90 cursor-pointer shrink-0 inline-flex items-center gap-1"
 title={value}
 >
 <span className="material-symbols-outlined text-[18px]">
 {copied ? "check" : "content_copy"}
 </span>
 {copied ? "Copied!" : label}
 </button>
 );
}

function SkillRow({ skill }) {
 const url = getSkillRawUrl(skill.id);
 return (
 <div
 className={`flex items-start gap-3 p-3 rounded-sm border ${
 skill.isEntry
 ? "border-primary/30 bg-primary/10"
 : "border-border bg-surface hover:bg-surface-2"
 }`}
 >
 <div
 className={`size-8 rounded-sm flex items-center justify-center shrink-0 ${
 skill.isEntry ? "bg-primary text-white" : "bg-primary/10 text-primary"
 }`}
 >
 <span className="material-symbols-outlined text-[18px]">{skill.icon}</span>
 </div>

 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-2 flex-wrap">
 <h3 className="font-semibold text-sm text-text-main">{skill.name}</h3>
 {skill.isEntry && (
 <Badge variant="primary" size="sm">START HERE</Badge>
 )}
 {skill.endpoint && (
 <Badge variant="default" size="sm">
 <code className="text-[11px]">{skill.endpoint}</code>
 </Badge>
 )}
 </div>
 <p className="text-xs text-text-muted mt-0.5">{skill.description}</p>
 <a
 href={getSkillBlobUrl(skill.id)}
 target="_blank"
 rel="noreferrer"
 className="text-[11px] text-text-muted hover:text-primary mt-1 inline-flex items-center gap-1 break-all"
 >
 {url}
 <span className="material-symbols-outlined text-[18px]">open_in_new</span>
 </a>
 </div>

 <CopyButton value={url} />
 </div>
 );
}

export default function SkillsPage() {
 return (
 <div className="flex w-full flex-col gap-3">
 <Card padding="md">
 <div className="text-xs text-text-muted mb-2">Paste this to your AI:</div>
 <div className="px-3 h-8 rounded-sm bg-surface font-mono text-[12px] text-text-main">
 Read this skill and use it: {getSkillRawUrl("9router")}
 </div>
 </Card>

 <div className="space-y-3">
 {SKILLS.map((skill) => (
 <SkillRow key={skill.id} skill={skill} />
 ))}
 </div>

 <Card padding="md">
 <div className="flex items-center justify-between gap-3 flex-wrap">
 <div>
 <h2 className="text-sm font-semibold text-text-main">More on GitHub</h2>
 <p className="text-xs text-text-muted mt-0.5">
 Browse source, README, and examples.
 </p>
 </div>
 <a
 href={`${SKILLS_REPO_URL}/tree/master/skills`}
 target="_blank"
 rel="noreferrer"
 className="text-sm text-primary hover:underline inline-flex items-center gap-1"
 >
 <span className="material-symbols-outlined text-[18px]">open_in_new</span>
 View on GitHub
 </a>
 </div>
 </Card>
 </div>
 );
}
