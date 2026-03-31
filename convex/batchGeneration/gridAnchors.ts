export type GridLevelCount = 3 | 5 | 7;

export type GridAxis = {
  name: string;
  lowAnchor: string;
  midAnchor: string;
  highAnchor: string;
};

export type LevelsPerAxis = GridLevelCount | Partial<Record<string, GridLevelCount>>;

export type GridAnchor = {
  axisValues: Record<string, number>;
  semanticLabels: Record<string, string>;
};

export type BatchCostEstimate = {
  totalUsers: number;
  estimatedTokens: number;
  estimatedCostUsd: number;
};

export type GenerationConfigValidation =
  | {
      valid: true;
      totalUsers: number;
    }
  | {
      valid: false;
      totalUsers: number;
      error: string;
    };

const DEFAULT_LEVELS_PER_AXIS: GridLevelCount = 3;
const SUPPORTED_LEVEL_COUNTS = new Set<GridLevelCount>([3, 5, 7]);
const USD_PER_1K_TOKENS = 0.01;

export function generateGridAnchors(
  axes: readonly GridAxis[],
  levelsPerAxis: LevelsPerAxis,
): GridAnchor[] {
  if (axes.length === 0) {
    return [];
  }

  return axes.reduce<GridAnchor[]>(
    (anchors, axis) => {
      const positions = buildAxisPositions(
        axis,
        resolveLevelsForAxis(axis, levelsPerAxis),
      );

      return anchors.flatMap((anchor) =>
        positions.map((position) => ({
          axisValues: {
            ...anchor.axisValues,
            [axis.name]: position.value,
          },
          semanticLabels: {
            ...anchor.semanticLabels,
            [axis.name]: position.label,
          },
        })),
      );
    },
    [{ axisValues: {}, semanticLabels: {} }],
  );
}

export function estimateBatchCost(
  totalUsers: number,
  tokensPerUser = 800,
): BatchCostEstimate {
  assertNonNegativeInteger(totalUsers, "Total users");
  assertNonNegativeNumber(tokensPerUser, "Tokens per user");

  const estimatedTokens = roundTo(totalUsers * tokensPerUser, 6);

  return {
    totalUsers,
    estimatedTokens,
    estimatedCostUsd: roundTo((estimatedTokens / 1_000) * USD_PER_1K_TOKENS, 6),
  };
}

export function validateGenerationConfig(
  axes: readonly GridAxis[],
  levelsPerAxis: LevelsPerAxis,
  maxCap = 10_000,
): GenerationConfigValidation {
  if (axes.length === 0) {
    return {
      valid: false,
      totalUsers: 0,
      error: "At least one axis required",
    };
  }

  try {
    assertNonNegativeInteger(maxCap, "Generation cap");

    const totalUsers = axes.reduce(
      (product, axis) => product * resolveLevelsForAxis(axis, levelsPerAxis),
      1,
    );

    if (totalUsers > maxCap) {
      return {
        valid: false,
        totalUsers,
        error: `Generation size ${totalUsers} exceeds cap of ${maxCap}`,
      };
    }

    return {
      valid: true,
      totalUsers,
    };
  } catch (error) {
    return {
      valid: false,
      totalUsers: 0,
      error: error instanceof Error ? error.message : "Invalid generation config",
    };
  }
}

function buildAxisPositions(axis: GridAxis, levelCount: GridLevelCount) {
  const midpointIndex = Math.floor(levelCount / 2);

  return Array.from({ length: levelCount }, (_, index) => {
    const value = roundTo(-1 + (2 * index) / (levelCount - 1), 12);

    return {
      value,
      label: labelForPosition(axis, index, midpointIndex),
    };
  });
}

function labelForPosition(
  axis: GridAxis,
  index: number,
  midpointIndex: number,
): string {
  if (index === 0) {
    return axis.lowAnchor;
  }

  if (index === midpointIndex) {
    return axis.midAnchor;
  }

  if (index === midpointIndex * 2) {
    return axis.highAnchor;
  }

  if (index < midpointIndex) {
    return interpolateLabel(axis.lowAnchor, axis.midAnchor, index / midpointIndex);
  }

  return interpolateLabel(
    axis.midAnchor,
    axis.highAnchor,
    (index - midpointIndex) / midpointIndex,
  );
}

function interpolateLabel(fromLabel: string, toLabel: string, progress: number) {
  return `${fromLabel} → ${toLabel} (${Math.round(progress * 100)}%)`;
}

function resolveLevelsForAxis(
  axis: GridAxis,
  levelsPerAxis: LevelsPerAxis,
): GridLevelCount {
  const requestedLevelCount =
    typeof levelsPerAxis === "number"
      ? levelsPerAxis
      : (levelsPerAxis[axis.name] ?? DEFAULT_LEVELS_PER_AXIS);

  if (!SUPPORTED_LEVEL_COUNTS.has(requestedLevelCount as GridLevelCount)) {
    throw new RangeError(
      `Unsupported level count ${requestedLevelCount} for axis "${axis.name}". Expected one of 3, 5, or 7.`,
    );
  }

  return requestedLevelCount as GridLevelCount;
}

function assertNonNegativeInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
}

function assertNonNegativeNumber(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative number.`);
  }
}

function roundTo(value: number, digits: number) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
