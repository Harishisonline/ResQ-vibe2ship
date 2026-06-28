"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Render assistant replies as GitHub-flavored Markdown so tables, bold,
 * lists, and code blocks display properly instead of as raw syntax.
 */
export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn(
        "text-sm leading-relaxed [&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
        "[&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5",
        "[_li]:my-0.5",
        "[_strong]:font-semibold",
        "[_em]:italic",
        "[_a]:text-primary [_a]:underline",
        "[_h1]:text-base [_h1]:font-semibold [_h1]:mt-2 [_h1]:mb-1",
        "[_h2]:text-sm [_h2]:font-semibold [_h2]:mt-2 [_h2]:mb-1",
        "[_h3]:text-sm [_h3]:font-semibold [_h3]:mt-1.5 [_h3]:mb-1",
        "[_hr]:my-2 [_hr]:border-border/60",
        "[_code]:rounded [_code]:bg-muted/70 [_code]:px-1 [_code]:py-0.5 [_code]:text-[0.85em] [_code]:font-mono",
        "[_pre]:my-2 [_pre]:overflow-x-auto [_pre]:rounded-lg [_pre]:bg-muted/60 [_pre]:p-3",
        "[_pre_code]:bg-transparent [_pre_code]:p-0",
        "[_blockquote]:border-l-2 [_blockquote]:border-border [_blockquote]:pl-3 [_blockquote]:text-muted-foreground",
        "overflow-x-auto",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children, ...props }) => (
            <div className="my-2 overflow-x-auto">
              <table
                className="w-full border-collapse text-[0.85em] [&_td]:border [&_td]:border-border/50 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border/50 [&_th]:bg-muted/40 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold"
                {...props}
              >
                {children}
              </table>
            </div>
          ),
          th: ({ children, ...props }) => <th {...props}>{children}</th>,
          td: ({ children, ...props }) => <td {...props}>{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
