import type { RunExecutionResult, RunMilestone } from "./runExecutor";
import {
  maskSecretsInBytes,
  redactSecrets,
  stripJpegMetadata,
  type MaskableSecret,
} from "./guardrails";
import { logStructuredError } from "./structuredLogger";

type ArtifactBucket = {
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | Blob,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
};

type ArtifactUploaderOptions = {
  runId: string;
  bucket?: ArtifactBucket;
  now?: () => number;
  secretValues?: readonly MaskableSecret[];
};

type UploadedMilestoneArtifact = {
  kind: "milestone_screenshot";
  key: string;
  stepIndex: number;
  actionType: string;
  url: string;
  title: string;
  rationaleShort: string;
  captureReason: RunMilestone["captureReason"];
};

type RunArtifactManifest = {
  runId: string;
  writtenAt: string;
  finalOutcome: RunExecutionResult["finalOutcome"];
  stepCount: number;
  durationSec: number;
  frustrationCount: number;
  artifacts: UploadedMilestoneArtifact[];
};

function getNow(now?: () => number) {
  return now ?? Date.now;
}

export function getMilestoneScreenshotKey(
  runId: string,
  milestone: Pick<RunMilestone, "stepIndex" | "actionType">,
) {
  return `runs/${runId}/milestones/${milestone.stepIndex}_${milestone.actionType}.jpg`;
}

export function getRunManifestKey(runId: string) {
  return `runs/${runId}/manifest.json`;
}

export function createArtifactUploader(options: ArtifactUploaderOptions) {
  const now = getNow(options.now);
  const uploadedArtifacts: UploadedMilestoneArtifact[] = [];

  return {
    async handleMilestone(milestone: RunMilestone, screenshot: Uint8Array) {
      if (!options.bucket) {
        return undefined;
      }

      const key = getMilestoneScreenshotKey(options.runId, milestone);
      const redactedMilestone = redactSecrets(milestone, options.secretValues ?? []);
      // Screenshot uploads are binary JPEGs. We strip textual metadata segments and only fall
      // back to byte-level secret masking for non-JPEG/text fixtures used by tests and other
      // text-like payloads.
      const sanitizedScreenshot = maskSecretsInBytes(
        stripJpegMetadata(screenshot),
        options.secretValues ?? [],
      );

      try {
        await options.bucket.put(key, sanitizedScreenshot, {
          httpMetadata: { contentType: "image/jpeg" },
        });
        uploadedArtifacts.push({
          kind: "milestone_screenshot",
          key,
          stepIndex: redactedMilestone.stepIndex,
          actionType: redactedMilestone.actionType,
          url: redactedMilestone.url,
          title: redactedMilestone.title,
          rationaleShort: redactedMilestone.rationaleShort,
          captureReason: redactedMilestone.captureReason,
        });
        return key;
      } catch (error) {
        logStructuredError("artifacts.milestone.error", options.runId, error, { key });
        return undefined;
      }
    },

    async writeManifest(result: RunExecutionResult) {
      if (!options.bucket) {
        return undefined;
      }

      const key = getRunManifestKey(options.runId);
      const manifest: RunArtifactManifest = {
        runId: options.runId,
        writtenAt: new Date(now()).toISOString(),
        finalOutcome: result.finalOutcome,
        stepCount: result.stepCount,
        durationSec: result.durationSec,
        frustrationCount: result.frustrationCount,
        artifacts: [...uploadedArtifacts],
      };

      try {
        await options.bucket.put(key, JSON.stringify(redactSecrets(manifest, options.secretValues ?? [])), {
          httpMetadata: { contentType: "application/json" },
        });
        return key;
      } catch (error) {
        logStructuredError("artifacts.manifest.error", options.runId, error, { key });
        return undefined;
      }
    },

    getUploadedArtifacts() {
      return [...uploadedArtifacts];
    },
  };
}
