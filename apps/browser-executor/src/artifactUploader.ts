import type { RunExecutionResult, RunMilestone } from "./runExecutor";

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

      try {
        await options.bucket.put(key, screenshot, {
          httpMetadata: { contentType: "image/jpeg" },
        });
        uploadedArtifacts.push({
          kind: "milestone_screenshot",
          key,
          stepIndex: milestone.stepIndex,
          actionType: milestone.actionType,
          url: milestone.url,
          title: milestone.title,
          rationaleShort: milestone.rationaleShort,
          captureReason: milestone.captureReason,
        });
        return key;
      } catch {
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
        await options.bucket.put(key, JSON.stringify(manifest), {
          httpMetadata: { contentType: "application/json" },
        });
        return key;
      } catch {
        return undefined;
      }
    },

    getUploadedArtifacts() {
      return [...uploadedArtifacts];
    },
  };
}
