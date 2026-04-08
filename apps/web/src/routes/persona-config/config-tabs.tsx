import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { PersonaConfigDetailSearch } from "@/router";

const configTabs = [
  { key: "overview", label: "Overview" },
  { key: "users", label: "Users" },
  { key: "transcripts", label: "Transcripts" },
  { key: "generation", label: "Generation" },
  { key: "review", label: "Review" },
] as const;

type ConfigTabKey = (typeof configTabs)[number]["key"];

const tabIndicatorTransition = {
  type: "spring" as const,
  visualDuration: 0.25,
  bounce: 0.15,
};

function ConfigTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: ConfigTabKey;
  onTabChange: (patch: Partial<PersonaConfigDetailSearch>) => void;
}) {
  return (
    <nav aria-label="Persona configuration workspaces">
      <div className="flex flex-wrap gap-2" role="tablist">
        {configTabs.map((tab) => {
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              aria-selected={isActive}
              className={cn(
                "relative rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              role="tab"
              type="button"
              onClick={() => onTabChange({ tab: tab.key })}
            >
              {isActive ? (
                <motion.span
                  className="absolute inset-0 rounded-md bg-primary"
                  data-testid="config-tabs-active-indicator"
                  layoutId="config-tabs-active-indicator"
                  transition={tabIndicatorTransition}
                />
              ) : null}
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export { ConfigTabs, configTabs };
export type { ConfigTabKey };
