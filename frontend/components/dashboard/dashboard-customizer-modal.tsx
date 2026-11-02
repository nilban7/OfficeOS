"use client";

import * as React from "react";
import {
  RotateCcw,
  Check,
  ChevronUp,
  ChevronDown,
  Layers,
  BarChart3,
  Calendar,
  Clock,
  FileSpreadsheet,
  Users,
  ShieldCheck,
  Plane,
  Receipt,
  ShoppingCart,
  CheckSquare,
  Search,
  Sparkles,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import {
  WIDGET_REGISTRY,
  PRESET_DEFINITIONS,
  buildConfigFromActiveIds,
  MASTER_DASHBOARD_CONFIG,
} from "@/lib/dashboard/widget-registry";
import type {
  DashboardWidgetId,
  DashboardWidgetConfig,
  DashboardPreset,
  UserDashboardPreference,
} from "@/types/dashboard";

const ICON_MAP: Record<string, React.ElementType> = {
  BarChart3,
  Clock,
  Layers,
  Users,
  ShieldCheck,
  Calendar,
  FileSpreadsheet,
  Plane,
  Receipt,
  ShoppingCart,
  CheckSquare,
};

interface DashboardCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPreference: UserDashboardPreference;
  onSave: (newPreference: UserDashboardPreference) => void;
}

export function DashboardCustomizerModal({
  isOpen,
  onClose,
  currentPreference,
  onSave,
}: DashboardCustomizerModalProps) {
  const [widgets, setWidgets] = React.useState<DashboardWidgetConfig[]>([]);
  const [selectedPreset, setSelectedPreset] = React.useState<DashboardPreset>("custom");
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [filterCategory, setFilterCategory] = React.useState<string>("all");

  // Sync internal state with props when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setWidgets(JSON.parse(JSON.stringify(currentPreference.widgets)));
      setSelectedPreset(currentPreference.preset);
      setSearchQuery("");
      setFilterCategory("all");
    }
  }, [isOpen, currentPreference]);

  // Apply a preset
  const handleApplyPreset = (presetKey: DashboardPreset) => {
    setSelectedPreset(presetKey);
    if (presetKey === "master") {
      setWidgets(JSON.parse(JSON.stringify(MASTER_DASHBOARD_CONFIG)));
      return;
    }

    const presetDef = PRESET_DEFINITIONS[presetKey];
    if (presetDef && presetDef.widgetIds.length > 0) {
      const newConfig = buildConfigFromActiveIds(presetDef.widgetIds);
      setWidgets(newConfig);
    }
  };

  // Toggle individual widget visibility
  const handleToggleWidget = (id: DashboardWidgetId) => {
    setSelectedPreset("custom");
    setWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w))
    );
  };

  // Move widget up in order
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    setSelectedPreset("custom");
    setWidgets((prev) => {
      const copy = [...prev];
      const prevItem = copy[index - 1];
      const curItem = copy[index];
      if (!prevItem || !curItem) return prev;
      copy[index - 1] = curItem;
      copy[index] = prevItem;
      return copy.map((w, idx) => ({ ...w, order: idx + 1 }));
    });
  };

  // Move widget down in order
  const handleMoveDown = (index: number) => {
    if (index >= widgets.length - 1) return;
    setSelectedPreset("custom");
    setWidgets((prev) => {
      const copy = [...prev];
      const nextItem = copy[index + 1];
      const curItem = copy[index];
      if (!nextItem || !curItem) return prev;
      copy[index + 1] = curItem;
      copy[index] = nextItem;
      return copy.map((w, idx) => ({ ...w, order: idx + 1 }));
    });
  };

  // Reset to Master Dashboard
  const handleResetToMaster = () => {
    handleApplyPreset("master");
  };

  // Save changes
  const handleSaveAndApply = () => {
    // Ensure at least one widget is active, otherwise default to projects
    const hasActive = widgets.some((w) => w.visible);
    const finalWidgets = hasActive
      ? widgets
      : widgets.map((w) => (w.id === "projects" ? { ...w, visible: true } : w));

    onSave({
      preset: selectedPreset,
      widgets: finalWidgets.map((w, idx) => ({ ...w, order: idx + 1 })),
      updatedAt: new Date().toISOString(),
    });
    onClose();
  };

  const activeCount = widgets.filter((w) => w.visible).length;

  const filteredWidgets = widgets.filter((w) => {
    const meta = WIDGET_REGISTRY[w.id];
    if (!meta) return false;
    const matchesSearch =
      meta.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      meta.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      meta.categoryLabel.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      filterCategory === "all" || meta.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title="Customize Your Dashboard"
      description="Choose exactly which modules to display, pick a role preset, or reorder widgets."
    >
      <div className="space-y-5">
        {/* Presets Strip */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
              1-Click Role Presets
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              {activeCount} of {widgets.length} widgets active
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                { key: "master", label: "Master Dashboard", sub: "Default Executive" },
                { key: "projects_only", label: "Projects Only", sub: "Individual Contributor" },
                { key: "manager_pulse", label: "Manager Pulse", sub: "Leaves + Projects + Reports" },
                { key: "operations_finance", label: "Ops & Finance", sub: "Travel + Procurement" },
              ] as const
            ).map((p) => {
              const isSelected = selectedPreset === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handleApplyPreset(p.key)}
                  className={cn(
                    "p-2.5 rounded-xl border text-left transition-all duration-150 flex flex-col justify-between",
                    isSelected
                      ? "border-primary-600 dark:border-primary-400 bg-primary-50/70 dark:bg-primary-950/40 text-primary-900 dark:text-primary-100 shadow-2xs"
                      : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  )}
                >
                  <span className="text-xs font-semibold block">{p.label}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate block">
                    {p.sub}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search module widgets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: "all", label: "All" },
              { id: "operations", label: "Operations" },
              { id: "people", label: "People & HR" },
              { id: "finance", label: "Finance" },
              { id: "executive", label: "Executive" },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setFilterCategory(cat.id)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                  filterCategory === cat.id
                    ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Widget Customization List */}
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {filteredWidgets.map((w) => {
            const meta = WIDGET_REGISTRY[w.id];
            if (!meta) return null;
            const Icon = ICON_MAP[meta.iconName] || Layers;
            const fullIndex = widgets.findIndex((item) => item.id === w.id);

            return (
              <div
                key={w.id}
                className={cn(
                  "p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors",
                  w.visible
                    ? "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs"
                    : "border-slate-100 dark:border-slate-800/60 bg-slate-50/70 dark:bg-slate-900/40 opacity-70"
                )}
              >
                {/* Left: Icon & Details */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                      w.visible
                        ? "bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {meta.title}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] py-0 px-1.5 hidden sm:inline-flex"
                      >
                        {meta.categoryLabel}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {meta.description}
                    </p>
                  </div>
                </div>

                {/* Right: Reorder & Toggle */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Reorder Arrows */}
                  <div className="flex items-center gap-0.5 border border-slate-200 dark:border-slate-800 rounded-lg p-0.5 bg-slate-50 dark:bg-slate-850">
                    <button
                      type="button"
                      onClick={() => handleMoveUp(fullIndex)}
                      disabled={fullIndex === 0}
                      className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none"
                      title="Move widget up"
                      aria-label={`Move ${meta.title} up`}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveDown(fullIndex)}
                      disabled={fullIndex === widgets.length - 1}
                      className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none"
                      title="Move widget down"
                      aria-label={`Move ${meta.title} down`}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Toggle Button */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={w.visible}
                    onClick={() => handleToggleWidget(w.id)}
                    className={cn(
                      "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1",
                      w.visible
                        ? "bg-primary-600"
                        : "bg-slate-300 dark:bg-slate-700"
                    )}
                  >
                    <span className="sr-only">Toggle {meta.title}</span>
                    <span
                      className={cn(
                        "pointer-events-none block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200",
                        w.visible ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Actions */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetToMaster}
            className="text-xs h-9 text-slate-600 dark:text-slate-400"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset to Master
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs h-9"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveAndApply}
              className="text-xs h-9 bg-primary-600 hover:bg-primary-700 text-white"
            >
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Apply & Save Layout
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
