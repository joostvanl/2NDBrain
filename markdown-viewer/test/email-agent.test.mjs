import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyAutomatedInformationalPolicy,
  applyCcOnlyPolicy,
  classificationTargetsMailbox,
  consolidateThreadDuplicates,
  createEmailAgent,
  dedupeNotifications,
  detectAutomatedInformationalMail,
  isInboxCcOnly,
  mailThreadKey,
  normalizeDismissedNotifications,
  notificationVisibleInActionList,
  notificationsMatchThread,
  resolveMailboxIdentity,
  resolveStatusAfterThreadUpdate,
} from "../server/email-agent.mjs";

function tmpEmailAgent() {
  const memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), "ioms-email-agent-"));
  const statePath = path.join(memoryDir, "system", "email-agent-state.json");
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  return { memoryDir, statePath, agent: createEmailAgent({ memoryDir, statePath }) };
}

test("email agent keeps archived notifications hidden across changed Outlook entry ids", () => {
  const { statePath, agent } = tmpEmailAgent();
  fs.writeFileSync(
    statePath,
    JSON.stringify(
      {
        version: 1,
        processedKeys: [],
        notifications: [
          {
            id: "old-archived",
            createdAt: "2026-06-11T08:00:00.000Z",
            updatedAt: "2026-06-11T09:00:00.000Z",
            status: "archived",
            messageKey: "old-entry|",
            entryId: "old-entry",
            storeId: "",
            direction: "incoming",
            folder: "inbox",
            subject: "Re: SLA afspraken DHL",
            from: "aurelie@example.com",
            to: "joost@example.com",
            mailDate: "2026-06-11T07:30:15.000Z",
            title: "SLA afspraken DHL",
            summary: "Opvolging nodig.",
            importanceReason: "Vraagt actie.",
            action: "Reageer.",
            requiresAction: true,
            priority: "hoog",
            tags: ["DHL"],
            memoryPath: "",
          },
          {
            id: "new-entry-duplicate",
            createdAt: "2026-06-11T10:00:00.000Z",
            updatedAt: "2026-06-11T10:00:00.000Z",
            status: "unread",
            messageKey: "new-entry|",
            entryId: "new-entry",
            storeId: "",
            direction: "incoming",
            folder: "inbox",
            subject: "SLA afspraken DHL",
            from: "Aurelie <aurelie@example.com>",
            to: "joost@example.com",
            mailDate: "2026-06-11T07:30:29.000Z",
            title: "SLA afspraken DHL",
            summary: "Opvolging nodig.",
            importanceReason: "Vraagt actie.",
            action: "Reageer.",
            requiresAction: true,
            priority: "hoog",
            tags: ["DHL"],
            memoryPath: "",
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  const list = agent.listNotifications();
  assert.equal(list.ok, true);
  assert.equal(list.total, 0);
  assert.deepEqual(list.notifications, []);
  assert.equal(agent.getStatus().notificationCount, 0);
});

test("notificationsMatchThread links replies and forwards to the same inbox thread", () => {
  const original = {
    folder: "inbox",
    subject: "SLA afspraken DHL",
    from: "aurelie@example.com",
    conversationId: "conv-123",
  };
  const reply = {
    subject: "Re: SLA afspraken DHL",
    senderEmail: "aurelie@example.com",
    conversationId: "conv-123",
  };
  const forward = {
    subject: "Fw: SLA afspraken DHL",
    senderEmail: "aurelie@example.com",
    conversationId: "conv-123",
  };
  assert.equal(notificationsMatchThread(original, reply, "inbox"), true);
  assert.equal(notificationsMatchThread(original, forward, "inbox"), true);
  assert.equal(
    mailThreadKey(reply, "inbox"),
    mailThreadKey(original, "inbox"),
  );
});

test("consolidateThreadDuplicates keeps archived thread dismissed when newer mail arrives", () => {
  const notifications = consolidateThreadDuplicates([
    {
      id: "card-a",
      createdAt: "2026-06-24T12:00:00.000Z",
      status: "archived",
      folder: "inbox",
      subject: "RE: DAP Natuurmonumenten",
      from: "a.markus@natuurmonumenten.nl",
      mailDate: "2026-06-24T13:54:15.2170000+02:00",
      summary: "Oud bericht.",
      action: "Oud.",
      requiresAction: false,
      entryId: "entry-a",
      messageKey: "entry-a|",
      conversationId: "conv-dap",
      threadMessageCount: 1,
      tags: [],
    },
    {
      id: "card-b",
      createdAt: "2026-07-09T07:39:00.000Z",
      status: "unread",
      folder: "inbox",
      subject: "FW: DAP Natuurmonumenten",
      from: "erik@example.com",
      to: "Joost van Leeuwaarden",
      mailDate: "2026-07-09T08:19:24.2090000+02:00",
      summary: "Erik vraagt Joost om Arnouds feedback in Confluence te verwerken.",
      action: "Verwerk alle actiepunten voor Joost uit Arnouds mail in Confluence.",
      requiresAction: true,
      priority: "hoog",
      entryId: "entry-b",
      messageKey: "entry-b|",
      conversationId: "conv-dap",
      threadMessageCount: 1,
      tags: ["Natuurmonumenten"],
    },
  ]);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].status, "archived");
  assert.equal(notifications[0].requiresAction, false);
});

test("resolveStatusAfterThreadUpdate never reopens archived notifications by default", () => {
  assert.equal(
    resolveStatusAfterThreadUpdate("archived", { requiresAction: true }),
    "archived",
  );
  assert.equal(
    resolveStatusAfterThreadUpdate("archived", { requiresAction: true }, { allowReactivateArchived: true }),
    "unread",
  );
});

test("normalizeDismissedNotifications clears requiresAction on archived items", () => {
  const notifications = [
    { status: "archived", requiresAction: true },
    { status: "unread", requiresAction: true },
    { status: "action_completed", requiresAction: true },
  ];
  assert.equal(normalizeDismissedNotifications(notifications), true);
  assert.equal(notifications[0].requiresAction, false);
  assert.equal(notifications[1].requiresAction, true);
  assert.equal(notifications[2].requiresAction, false);
});

test("classificationTargetsMailbox detects delegated CC work", () => {
  const identity = resolveMailboxIdentity({
    mailboxEmails: ["joost@example.com"],
    mailboxDisplayNames: ["Joost van Leeuwaarden"],
  });
  assert.equal(
    classificationTargetsMailbox(
      {
        requiresAction: true,
        action: "Verwerk de Confluence-punten.",
        summary: "Erik legt de punten bij Joost neergelegd.",
      },
      { bodySnippet: "bij Joost neergelegd om op te pakken." },
      identity,
    ),
    true,
  );
});

test("consolidateThreadDuplicates merges duplicate inbox cards for one thread", () => {
  const notifications = consolidateThreadDuplicates([
    {
      id: "card-a",
      createdAt: "2026-06-11T08:00:00.000Z",
      status: "read",
      folder: "inbox",
      subject: "SLA afspraken DHL",
      from: "aurelie@example.com",
      mailDate: "2026-06-11T07:30:00.000Z",
      summary: "Eerste bericht.",
      action: "Oud.",
      requiresAction: false,
      entryId: "entry-a",
      messageKey: "entry-a|",
      threadMessageCount: 1,
      tags: [],
    },
    {
      id: "card-b",
      createdAt: "2026-06-11T10:00:00.000Z",
      status: "unread",
      folder: "inbox",
      subject: "Re: SLA afspraken DHL",
      from: "aurelie@example.com",
      mailDate: "2026-06-11T09:45:00.000Z",
      summary: "Laatste follow-up.",
      action: "Reageer op nieuwe vraag.",
      requiresAction: true,
      priority: "hoog",
      entryId: "entry-b",
      messageKey: "entry-b|",
      threadMessageCount: 1,
      tags: ["DHL"],
    },
  ]);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].entryId, "entry-b");
  assert.equal(notifications[0].summary, "Laatste follow-up.");
  assert.equal(notifications[0].requiresAction, true);
  assert.equal(notifications[0].threadMessageCount, 2);
});

test("dedupeNotifications shows one action card per thread in the inbox list", () => {
  const visible = dedupeNotifications([
    {
      id: "card-a",
      createdAt: "2026-06-11T08:00:00.000Z",
      status: "unread",
      folder: "inbox",
      subject: "Monitoring fee",
      from: "hero@example.com",
      mailDate: "2026-06-11T08:00:00.000Z",
      requiresAction: true,
      entryId: "a",
      messageKey: "a|",
      tags: [],
    },
    {
      id: "card-b",
      createdAt: "2026-06-11T11:00:00.000Z",
      status: "unread",
      folder: "inbox",
      subject: "Re: Monitoring fee",
      from: "hero@example.com",
      mailDate: "2026-06-11T11:00:00.000Z",
      requiresAction: true,
      entryId: "b",
      messageKey: "b|",
      tags: [],
    },
  ]).filter((n) => notificationVisibleInActionList(n, resolveMailboxIdentity()));
  assert.equal(visible.length, 1);
  assert.equal(visible[0].entryId, "b");
});

test("isInboxCcOnly detects mailbox owner only in CC", () => {
  const identity = resolveMailboxIdentity({
    mailboxEmails: ["joost@example.com"],
    mailboxDisplayNames: ["Joost van Leeuwaarden"],
  });
  assert.equal(
    isInboxCcOnly(
      {
        to: "Aurelie <aurelie@example.com>",
        cc: "Joost van Leeuwaarden <joost@example.com>",
      },
      identity,
    ),
    true,
  );
  assert.equal(
    isInboxCcOnly(
      {
        to: "Joost van Leeuwaarden",
        cc: "Aurelie <aurelie@example.com>",
      },
      identity,
    ),
    false,
  );
});

test("applyCcOnlyPolicy suppresses action for CC-only inbox mail", () => {
  const identity = resolveMailboxIdentity({
    mailboxEmails: ["joost@example.com"],
    mailboxDisplayNames: ["Joost Example"],
  });
  const result = applyCcOnlyPolicy(
    {
      relevant: true,
      requiresAction: false,
      category: "informatie",
      action: "",
      importanceReason: "Ter info.",
      summary: "Update voor het team.",
      tags: [],
      classifier: "llm",
    },
    {
      to: "aurelie@example.com",
      cc: "joost@example.com",
    },
    "inbox",
    identity,
  );
  assert.equal(result.ccOnly, true);
  assert.equal(result.classification.requiresAction, false);
  assert.equal(result.classification.category, "cc_ter_informatie");
});

test("applyCcOnlyPolicy keeps action when CC mail delegates work to mailbox owner", () => {
  const identity = resolveMailboxIdentity({
    mailboxEmails: ["joost@example.com"],
    mailboxDisplayNames: ["Joost van Leeuwaarden"],
  });
  const result = applyCcOnlyPolicy(
    {
      relevant: true,
      requiresAction: true,
      category: "project",
      action: "Verwerk de Confluence-punten uit Arnouds feedback.",
      importanceReason: "Joost moet de resterende punten oppakken.",
      summary: "Erik legt de inhoudelijke punten bij Joost neergelegd om op te pakken.",
      tags: ["Natuurmonumenten"],
      classifier: "llm",
    },
    {
      to: "Arnoud Markus",
      cc: "Joost van Leeuwaarden",
      bodySnippet: "De overige punten heb ik bij Joost neergelegd om op te pakken.",
    },
    "inbox",
    identity,
  );
  assert.equal(result.ccOnly, false);
  assert.equal(result.classification.requiresAction, true);
});

test("applyCcOnlyPolicy suppresses FYI CC mail without mailbox-specific action", () => {
  const identity = resolveMailboxIdentity({
    mailboxEmails: ["joost@example.com"],
    mailboxDisplayNames: ["Joost Example"],
  });
  const result = applyCcOnlyPolicy(
    {
      relevant: true,
      requiresAction: false,
      category: "informatie",
      action: "",
      importanceReason: "Ter info.",
      summary: "Update voor het team.",
      tags: [],
      classifier: "llm",
    },
    {
      to: "aurelie@example.com",
      cc: "joost@example.com",
    },
    "inbox",
    identity,
  );
  assert.equal(result.ccOnly, true);
  assert.equal(result.classification.requiresAction, false);
  assert.equal(result.classification.category, "cc_ter_informatie");
});

test("notificationVisibleInActionList hides CC-only notifications", () => {
  const identity = resolveMailboxIdentity({
    mailboxEmails: ["joost@example.com"],
    mailboxDisplayNames: ["Joost Example"],
  });
  assert.equal(
    notificationVisibleInActionList(
      {
        folder: "inbox",
        status: "unread",
        requiresAction: true,
        ccOnly: true,
      },
      identity,
    ),
    false,
  );
  assert.equal(
    notificationVisibleInActionList(
      {
        folder: "inbox",
        status: "unread",
        requiresAction: true,
        to: "aurelie@example.com",
        cc: "joost@example.com",
      },
      identity,
    ),
    false,
  );
  assert.equal(
    notificationVisibleInActionList(
      {
        folder: "inbox",
        status: "unread",
        requiresAction: true,
        to: "Joost van Leeuwaarden",
        action: "Verwerk de openstaande Confluence-punten.",
      },
      identity,
    ),
    true,
  );
});

test("detectAutomatedInformationalMail recognizes calendar responses and Confluence", () => {
  assert.deepEqual(detectAutomatedInformationalMail({ subject: "Accepted: SLA overleg" }), {
    kind: "calendar_response",
    memoryEligible: false,
  });
  assert.deepEqual(detectAutomatedInformationalMail({ subject: "Geaccepteerd: Kick-off" }), {
    kind: "calendar_response",
    memoryEligible: false,
  });
  assert.equal(
    detectAutomatedInformationalMail({
      subject: "[Confluence] Page updated in Managed Services",
      senderEmail: "confluence@atlassian.com",
    })?.kind,
    "confluence",
  );
  assert.equal(
    detectAutomatedInformationalMail({
      subject: "JIRA Updates for DHLEXS_DHLEXC-376",
      senderEmail: "jira@iodigital.com",
    })?.kind,
    "jira_automation",
  );
});

test("applyAutomatedInformationalPolicy keeps memory for Confluence but hides action", () => {
  const result = applyAutomatedInformationalPolicy(
    {
      relevant: true,
      requiresAction: true,
      category: "taak",
      action: "Reageer.",
      importanceReason: "Vraagt actie.",
      tags: [],
      classifier: "llm",
    },
    {
      subject: "[Confluence] Page updated",
      senderEmail: "confluence@atlassian.com",
    },
    "inbox",
  );
  assert.equal(result.automatedInfo, true);
  assert.equal(result.classification.requiresAction, false);
  assert.equal(result.classification.relevant, true);
  assert.equal(result.classification.automatedInfo, true);
});

test("applyAutomatedInformationalPolicy ignores calendar responses without memory", () => {
  const result = applyAutomatedInformationalPolicy(
    {
      relevant: true,
      requiresAction: true,
      category: "taak",
      action: "Reageer.",
      importanceReason: "Vraagt actie.",
      tags: [],
      classifier: "llm",
    },
    { subject: "Declined: Weekly sync" },
    "inbox",
  );
  assert.equal(result.automatedInfo, true);
  assert.equal(result.classification.requiresAction, false);
  assert.equal(result.classification.relevant, false);
});

test("notificationVisibleInActionList hides automated informational notifications", () => {
  const identity = resolveMailboxIdentity();
  assert.equal(
    notificationVisibleInActionList(
      {
        folder: "inbox",
        status: "unread",
        requiresAction: true,
        automatedInfo: true,
      },
      identity,
    ),
    false,
  );
});
