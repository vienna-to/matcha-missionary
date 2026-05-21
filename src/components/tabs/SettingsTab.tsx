"use client";

import { useStore } from "@/lib/store";
import { initialSeed } from "@/lib/seed";
import { Button, Card, Field, Input } from "@/components/ui";
import { formatWorkspaceCode } from "@/lib/id";

export default function SettingsTab() {
  const { state, dispatch } = useStore();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-matcha-900/60">
          Workspace pairing, thresholds, and sample data.
        </p>
      </header>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold">Workspace code</h2>
        <p className="text-xs text-matcha-900/60">
          Share this with a second device to sync in real time across tabs (and, in the
          future, across devices).
        </p>
        <div className="flex items-center gap-2">
          <code className="rounded-lg bg-cream-100 px-3 py-2 text-sm font-mono">
            {formatWorkspaceCode(state.settings.workspaceCode)}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigator.clipboard?.writeText(formatWorkspaceCode(state.settings.workspaceCode))}
          >
            Copy
          </Button>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold">Display</h2>
        <Field label="Low-margin warning threshold (%)" hint="Items below this margin show a warning icon.">
          <Input
            type="number"
            min={0}
            max={100}
            step={1}
            value={state.settings.lowMarginThresholdPct}
            onChange={(e) =>
              dispatch({
                type: "UPDATE_SETTINGS",
                patch: { lowMarginThresholdPct: Number(e.target.value) || 0 },
              })
            }
            className="max-w-32"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.settings.baristaPingEnabled}
            onChange={(e) =>
              dispatch({
                type: "UPDATE_SETTINGS",
                patch: { baristaPingEnabled: e.target.checked },
              })
            }
            className="h-4 w-4 accent-matcha-500"
          />
          Play a subtle ping in the Barista Queue when a new order arrives
        </label>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold">Sample data</h2>
        <p className="text-xs text-matcha-900/60">
          Reseed the workspace with the UCI Spring Pop-Up demo (9 menu items, ~20
          ingredients, 30 sample orders). Existing data will be replaced.
        </p>
        <Button
          variant="danger"
          size="sm"
          onClick={() => {
            if (confirm("Replace all current data with the sample seed?")) {
              dispatch({ type: "RESET_TO_SEED", seed: initialSeed() });
            }
          }}
        >
          Reset to sample data
        </Button>
      </Card>
    </div>
  );
}
