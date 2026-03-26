import { act } from "react";
import ReactDOM from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

import { SettingsPage } from "@/routes/settings-page";

type TaskCategory =
  | "expansion"
  | "action"
  | "summarization"
  | "clustering"
  | "recommendation";

type CredentialSummary = {
  _id: string;
  ref: string;
  label: string;
  description: string;
  allowedStudyIds: string[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
};

type SettingsView = {
  orgId: string;
  domainAllowlist: string[];
  maxConcurrency: number;
  modelConfig: Array<{
    taskCategory: TaskCategory;
    modelId: string;
  }>;
  runBudgetCap: number;
  budgetLimits: {
    maxTokensPerStudy?: number;
    maxBrowserSecPerStudy?: number;
  };
  browserPolicy: {
    blockAnalytics: boolean;
    blockHeavyMedia: boolean;
    screenshotFormat: string;
    screenshotMode: string;
  };
  signedUrlExpirySeconds: number;
  updatedBy: string | null;
  updatedAt: number | null;
  credentials: CredentialSummary[];
};

let mockedSettings: SettingsView | undefined = undefined;
let credentialStore: CredentialSummary[] = [];

const updateSettingsMock = vi.fn();
const addDomainToAllowlistMock = vi.fn();
const removeDomainFromAllowlistMock = vi.fn();
const createCredentialMock = vi.fn();
const updateCredentialMock = vi.fn();
const deleteCredentialMock = vi.fn();

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock("convex/react", () => ({
  useQuery: (query: unknown) => {
    const queryName = getFunctionName(query as never);

    if (queryName === "settings:getSettings") {
      return mockedSettings;
    }

    return undefined;
  },
  useMutation: (mutation: unknown) => {
    const mutationName = getFunctionName(mutation as never);

    if (mutationName === "settings:updateSettings") {
      return updateSettingsMock;
    }

    if (mutationName === "settings:addDomainToAllowlist") {
      return addDomainToAllowlistMock;
    }

    if (mutationName === "settings:removeDomainFromAllowlist") {
      return removeDomainFromAllowlistMock;
    }

    if (mutationName === "credentials:createCredential") {
      return createCredentialMock;
    }

    if (mutationName === "credentials:updateCredential") {
      return updateCredentialMock;
    }

    if (mutationName === "credentials:deleteCredential") {
      return deleteCredentialMock;
    }

    return vi.fn();
  },
}));

const mountedRoots: ReactDOM.Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }

  document.body.innerHTML = "";
});

beforeEach(() => {
  mockedSettings = makeSettingsView();
  credentialStore = [...(mockedSettings?.credentials ?? [])];

  updateSettingsMock.mockReset();
  updateSettingsMock.mockImplementation(async ({ patch }: { patch: any }) => {
    mockedSettings = {
      ...(mockedSettings as SettingsView),
      ...patch,
      budgetLimits: {
        maxTokensPerStudy: patch.budgetLimits?.maxTokensPerStudy,
        maxBrowserSecPerStudy: patch.budgetLimits?.maxBrowserSecPerStudy,
      },
      browserPolicy: patch.browserPolicy,
      updatedAt: 1_710_000_100_000,
      updatedBy: "org-admin",
    };

    const nextSettings = mockedSettings as SettingsView;
    const { credentials: _credentials, ...result } = nextSettings;
    return result;
  });

  addDomainToAllowlistMock.mockReset();
  addDomainToAllowlistMock.mockImplementation(
    async ({ domain }: { domain: string }) => {
    mockedSettings = {
      ...(mockedSettings as SettingsView),
      domainAllowlist: normalizeDomainAllowlist([
        ...(mockedSettings as SettingsView).domainAllowlist,
        domain,
      ]),
      updatedAt: 1_710_000_100_100,
      updatedBy: "org-admin",
    };

      const nextSettings = mockedSettings as SettingsView;
      const { credentials: _credentials, ...result } = nextSettings;
    return result;
    },
  );

  removeDomainFromAllowlistMock.mockReset();
  removeDomainFromAllowlistMock.mockImplementation(
    async ({ domain }: { domain: string }) => {
    mockedSettings = {
      ...(mockedSettings as SettingsView),
      domainAllowlist: (mockedSettings as SettingsView).domainAllowlist.filter(
        (currentDomain) => currentDomain !== normalizeDomain(domain),
      ),
      updatedAt: 1_710_000_100_200,
      updatedBy: "org-admin",
    };

      const nextSettings = mockedSettings as SettingsView;
      const { credentials: _credentials, ...result } = nextSettings;
    return result;
    },
  );

  createCredentialMock.mockReset();
  createCredentialMock.mockImplementation(
    async ({ credential }: { credential: any }) => {
    const created: CredentialSummary = {
      _id: `credential-${credential.ref}`,
      ref: credential.ref,
      label: credential.label,
      description: credential.description ?? "",
      allowedStudyIds: credential.allowedStudyIds ?? [],
      createdBy: "org-admin",
      createdAt: 1_710_000_100_300,
      updatedAt: 1_710_000_100_300,
    };

    credentialStore = [created, ...credentialStore];

    return created;
    },
  );

  updateCredentialMock.mockReset();
  updateCredentialMock.mockImplementation(
    async ({
      credentialId,
      patch,
    }: {
      credentialId: string;
      patch: any;
    }) => {
    const currentCredential = credentialStore.find(
      (credential) => credential._id === credentialId,
    );

    if (!currentCredential) {
      throw new Error("Credential not found");
    }

    const updated: CredentialSummary = {
      ...currentCredential,
      ref: patch.ref,
      label: patch.label,
      description: patch.description,
      allowedStudyIds: patch.allowedStudyIds ?? [],
      updatedAt: 1_710_000_100_400,
    };

    credentialStore = credentialStore.map((credential) =>
      credential._id === credentialId ? updated : credential,
    );

    return updated;
    },
  );

  deleteCredentialMock.mockReset();
  deleteCredentialMock.mockImplementation(
    async ({ credentialId }: { credentialId: string }) => {
      credentialStore = credentialStore.filter(
        (credential) => credential._id !== credentialId,
      );
    return { credentialId, deleted: true as const };
    },
  );
});

describe("SettingsPage", () => {
  it("renders every admin settings category with the current values", async () => {
    const { container } = await renderSettingsPage();

    expect(container.textContent).toContain("Workspace settings");
    expect(container.textContent).toContain("Domain allowlist");
    expect(container.textContent).toContain("Concurrency");
    expect(container.textContent).toContain("AI model configuration");
    expect(container.textContent).toContain("Budget caps");
    expect(container.textContent).toContain("Browser policy");
    expect(container.textContent).toContain("Credentials");
    expect(container.textContent).toContain("checkout.example.com");
    expect(container.textContent).toContain("Checkout fixture");
    expect(
      container.querySelector<HTMLInputElement>("#settings-model-action")?.value,
    ).toBe("gpt-5.4-nano");
  });

  it("saves workspace configuration and updates the domain allowlist", async () => {
    const { container } = await renderSettingsPage();

    await updateInput(container, "#settings-max-concurrency", "12");
    await updateInput(container, "#settings-run-budget-cap", "72");
    await updateInput(container, "#settings-max-tokens", "2400");
    await updateInput(container, "#settings-max-browser-sec", "900");
    await updateInput(container, "#settings-model-expansion", "model-expansion");
    await updateSelect(container, "#settings-browser-screenshot-format", "png");
    await updateSelect(container, "#settings-browser-screenshot-mode", "all");
    await toggleCheckbox(container, "#settings-browser-block-analytics", true);
    await toggleCheckbox(container, "#settings-browser-block-heavy-media", true);

    await clickButton(container, "Save configuration");

    expect(updateSettingsMock).toHaveBeenCalledWith({
      patch: {
        maxConcurrency: 12,
        modelConfig: [
          { taskCategory: "expansion", modelId: "model-expansion" },
          { taskCategory: "action", modelId: "gpt-5.4-nano" },
          { taskCategory: "summarization", modelId: "gpt-5.4-mini" },
        ],
        runBudgetCap: 72,
        budgetLimits: {
          maxTokensPerStudy: 2400,
          maxBrowserSecPerStudy: 900,
        },
        browserPolicy: {
          blockAnalytics: true,
          blockHeavyMedia: true,
          screenshotFormat: "png",
          screenshotMode: "all",
        },
      },
    });
    expect(container.textContent).toContain("Workspace configuration saved.");

    await updateInput(container, "#settings-domain-input", "media.example.com");
    await clickButton(container, "Add domain");

    expect(addDomainToAllowlistMock).toHaveBeenCalledWith({
      domain: "media.example.com",
    });
    expect(container.textContent).toContain("media.example.com");

    await clickElement(
      container,
      'button[aria-label="Remove media.example.com"]',
    );

    expect(removeDomainFromAllowlistMock).toHaveBeenCalledWith({
      domain: "media.example.com",
    });
    expect(
      container.querySelector('button[aria-label="Remove media.example.com"]'),
    ).toBeNull();
  });

  it("creates, edits, and deletes credential summaries", async () => {
    const { container } = await renderSettingsPage();

    await clickButton(container, "Add credential");
    await updateInput(container, "#credential-ref", "cred_support");
    await updateInput(container, "#credential-label", "Support escalation");
    await updateTextarea(
      container,
      "#credential-description",
      "Escalation mailbox for support fixtures",
    );
    await updateInput(container, "#credential-study-ids", "study-support");
    await updateInput(
      container,
      'input[aria-label="Credential key 1"]',
      "email",
    );
    await updateInput(
      container,
      'input[aria-label="Credential value 1"]',
      "support@example.com",
    );

    await clickButton(container, "Save credential");

    expect(createCredentialMock).toHaveBeenCalledWith({
      credential: {
        ref: "cred_support",
        label: "Support escalation",
        description: "Escalation mailbox for support fixtures",
        allowedStudyIds: ["study-support"],
        payload: [{ key: "email", value: "support@example.com" }],
      },
    });
    expect(container.textContent).toContain("Support escalation");

    await clickElement(
      container,
      'button[aria-label="Edit credential cred_support"]',
    );
    await updateInput(container, "#credential-label", "Support escalation v2");
    await updateInput(container, "#credential-study-ids", "");
    await clickButton(container, "Update credential");

    expect(updateCredentialMock).toHaveBeenCalledWith({
      credentialId: "credential-cred_support",
      patch: {
        ref: "cred_support",
        label: "Support escalation v2",
        description: "Escalation mailbox for support fixtures",
        allowedStudyIds: null,
      },
    });
    expect(container.textContent).toContain("Support escalation v2");

    await clickElement(
      container,
      'button[aria-label="Delete credential cred_support"]',
    );

    expect(deleteCredentialMock).toHaveBeenCalledWith({
      credentialId: "credential-cred_support",
    });
    expect(container.textContent).not.toContain("Support escalation v2");
  });
});

async function renderSettingsPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  mountedRoots.push(root);

  await act(async () => {
    root.render(<SettingsPage />);
  });

  return { container };
}

async function clickButton(container: HTMLDivElement, text: string) {
  const button = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === text,
  );

  expect(button).toBeDefined();

  await act(async () => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function clickElement(container: HTMLDivElement, selector: string) {
  const element = container.querySelector<HTMLElement>(selector);

  expect(element).not.toBeNull();

  await act(async () => {
    element!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function updateInput(
  container: HTMLDivElement,
  selector: string,
  value: string,
) {
  const input = container.querySelector<HTMLInputElement>(selector);

  expect(input).not.toBeNull();

  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, value);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
    input!.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function updateTextarea(
  container: HTMLDivElement,
  selector: string,
  value: string,
) {
  const textarea = container.querySelector<HTMLTextAreaElement>(selector);

  expect(textarea).not.toBeNull();

  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(textarea, value);
    textarea!.dispatchEvent(new Event("input", { bubbles: true }));
    textarea!.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function updateSelect(
  container: HTMLDivElement,
  selector: string,
  value: string,
) {
  const select = container.querySelector<HTMLSelectElement>(selector);

  expect(select).not.toBeNull();

  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(select, value);
    select!.dispatchEvent(new Event("input", { bubbles: true }));
    select!.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function toggleCheckbox(
  container: HTMLDivElement,
  selector: string,
  checked: boolean,
) {
  const checkbox = container.querySelector<HTMLInputElement>(selector);

  expect(checkbox).not.toBeNull();

  if (checkbox!.checked === checked) {
    return;
  }

  await act(async () => {
    checkbox!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    checkbox!.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function makeSettingsView(): SettingsView {
  return {
    orgId: "org-admin",
    domainAllowlist: ["checkout.example.com"],
    maxConcurrency: 6,
    modelConfig: [
      { taskCategory: "action", modelId: "gpt-5.4-nano" },
      { taskCategory: "summarization", modelId: "gpt-5.4-mini" },
    ],
    runBudgetCap: 64,
    budgetLimits: {
      maxTokensPerStudy: 1800,
      maxBrowserSecPerStudy: 600,
    },
    browserPolicy: {
      blockAnalytics: false,
      blockHeavyMedia: false,
      screenshotFormat: "jpeg",
      screenshotMode: "milestones",
    },
    signedUrlExpirySeconds: 14400,
    updatedBy: "org-admin",
    updatedAt: 1_710_000_000_000,
    credentials: [
      {
        _id: "credential-checkout",
        ref: "cred_checkout",
        label: "Checkout fixture",
        description: "Shared checkout account",
        allowedStudyIds: ["study-checkout"],
        createdBy: "org-admin",
        createdAt: 1_710_000_000_000,
        updatedAt: 1_710_000_000_000,
      },
    ],
  };
}

function normalizeDomainAllowlist(domains: string[]) {
  return [...new Set(domains.map(normalizeDomain))].sort();
}

function normalizeDomain(value: string) {
  const trimmedValue = value.trim();

  try {
    if (trimmedValue.includes("://")) {
      return new URL(trimmedValue).hostname.toLowerCase();
    }

    return new URL(`https://${trimmedValue}`).hostname.toLowerCase();
  } catch {
    return trimmedValue
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, "")
      .toLowerCase();
  }
}
