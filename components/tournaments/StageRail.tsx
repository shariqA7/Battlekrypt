import LocalDate from "@/components/ui/LocalDate";
import { CheckIcon, TrophyIcon } from "@/components/ui/icons";
import type { RailNode } from "@/lib/tournament-view";

// The signature element (spec §14): a connected strip of nodes, Registration →
// Qualifiers → Semis → Finals. Teal/gold = done or live, hollow = still to come.
// Horizontal from md up; a vertical timeline on phones.

function Icon({ node }: { node: RailNode }) {
  if (node.last && node.state !== "upcoming") {
    return <TrophyIcon size={20} className="text-bk-gold" />;
  }
  if (node.last) return <TrophyIcon size={20} className="text-bk-faint" />;
  if (node.state === "done") {
    return (
      <span className="w-7 h-7 rounded-full bg-bk-gold-from text-bk-on-gold inline-flex items-center justify-center">
        <CheckIcon size={16} />
      </span>
    );
  }
  if (node.state === "live") {
    return (
      <span className="w-7 h-7 rounded-full border-2 border-bk-gold-from inline-flex items-center justify-center shadow-[0_0_10px_rgba(244,200,66,0.35)]">
        <span className="w-3 h-3 rounded-full bg-bk-gold-from" />
      </span>
    );
  }
  return <span className="w-7 h-7 rounded-full border-2 border-bk-faint inline-block" />;
}

function Note({ node }: { node: RailNode }) {
  const mono = "font-mono text-[13px]";
  if (node.note === "live") {
    return <span className={`${mono} inline-block bg-bk-surface-hover border border-bk-border text-bk-heading px-2.5 py-1`}>Live now</span>;
  }
  if (node.note === "open") return <span className={`${mono} text-bk-body`}>Open</span>;
  if (node.note === "closed") return <span className={`${mono} text-bk-body`}>Closed</span>;
  if (node.note === "ended") return <span className={`${mono} text-bk-body`}>Ended</span>;
  if (node.note === "starts" && node.date) {
    return (
      <span className={`${mono} text-bk-muted`}>
        Starts <LocalDate iso={node.date.toISOString()} />
      </span>
    );
  }
  return <span className={`${mono} text-bk-muted`}>Date to be announced</span>;
}

export default function StageRail({ nodes }: { nodes: RailNode[] }) {
  return (
    <ol className="bg-bk-surface border border-bk-border border-l-[3px] border-l-bk-gold-to p-5 sm:p-6 flex flex-col gap-6 md:flex-row md:gap-0">
      {nodes.map((n, i) => (
        <li key={n.key} className="relative flex md:flex-1 gap-4 md:flex-col md:gap-3" aria-current={n.state === "live" ? "step" : undefined}>
          {/* the connector: a vertical line on phones, a horizontal one from md up */}
          {i < nodes.length - 1 && (
            <>
              <span aria-hidden className="md:hidden absolute left-[13px] top-8 bottom-[-24px] w-px bg-bk-border" />
              <span aria-hidden className="hidden md:block absolute top-[13px] left-9 right-3 h-px bg-bk-border" />
            </>
          )}
          <div className="relative z-[1] w-7 h-7 shrink-0 flex items-center justify-center bg-bk-surface">
            <Icon node={n} />
          </div>
          <div className="min-w-0">
            <p
              className={`font-sans font-bold text-[12px] uppercase tracking-[1.6px] ${
                n.state === "upcoming" ? "text-bk-muted" : n.state === "live" ? "text-bk-heading" : "text-bk-gold"
              }`}
            >
              {n.label}
            </p>
            <div className="mt-1.5">
              <Note node={n} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
