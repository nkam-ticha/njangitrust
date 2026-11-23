// Retention (D33): what members sent is deleted three months later (messages, media, agent history,
// upload slots); the ledger, votes and every other record of the group stay.
import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getPrisma } from '../../lib/prisma';
import { getStorage } from '../../storage';
import { repeatableJobs } from '../../jobs/registry';
import { registerJobs } from '../register';
import { buildWorld, type World } from '../../../test/helpers/permission-matrix';
import { FILES, uploadFile } from '../../../test/helpers/media-files';
import { RETENTION_DAYS, purgeExpiredContent, retentionCutoff } from './retention.service';

const DAY = 86_400_000;
let world: World;
const now = new Date();
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);

beforeAll(async () => {
  world = await buildWorld();
});
afterEach(() => vi.restoreAllMocks());

const message = (createdAt: Date, text = 'Bonjour') =>
  getPrisma().message.create({
    data: {
      groupId: world.groupId,
      authorMembershipId: world.member.membershipId,
      kind: 'TEXT',
      text,
      createdAt,
    },
  });

describe('the retention period', () => {
  it('is three months: a cut-off 90 days before now', () => {
    expect(RETENTION_DAYS).toBe(90);
    expect(retentionCutoff(now).getTime()).toBe(now.getTime() - 90 * DAY);
  });

  it('runs every day, with a second run to catch a missed one', () => {
    registerJobs();
    expect(repeatableJobs()).toContainEqual(
      expect.objectContaining({ name: 'retention.purge', pattern: '30 3,9 * * *' }),
    );
  });
});

describe('purging chat', () => {
  it('deletes messages older than three months and keeps the newer ones', async () => {
    const old = await message(daysAgo(91), 'très vieux');
    const edge = await message(daysAgo(89), 'presque');
    const fresh = await message(daysAgo(1), 'récent');
    const reply = await getPrisma().message.create({
      data: {
        groupId: world.groupId,
        authorMembershipId: world.member.membershipId,
        kind: 'TEXT',
        text: 'réponse récente à un vieux message',
        replyToId: old.id,
        createdAt: daysAgo(2),
      },
    });
    const result = await purgeExpiredContent(now);
    expect(result.messages).toBeGreaterThanOrEqual(1);
    const left = await getPrisma().message.findMany({
      where: { id: { in: [old.id, edge.id, fresh.id, reply.id] } },
      select: { id: true, replyToId: true },
    });
    expect(left.map((m) => m.id).sort()).toEqual([edge.id, fresh.id, reply.id].sort());
    // A kept reply simply loses the link to the deleted message.
    expect(left.find((m) => m.id === reply.id)?.replyToId).toBeNull();
  });

  it('deletes the stored files and the attachment of an old message, and keeps a recent one', async () => {
    const oldFile = await uploadFile(world.member, world.groupId, {
      kind: 'IMAGE',
      mime: 'image/jpeg',
      bytes: FILES.jpeg(),
      thumbnail: FILES.jpeg(),
    });
    const newFile = await uploadFile(world.member, world.groupId, {
      kind: 'DOCUMENT',
      mime: 'application/pdf',
      bytes: FILES.pdf(),
    });
    const prisma = getPrisma();
    const oldRow = await prisma.attachment.findUniqueOrThrow({ where: { id: oldFile.id } });
    const newRow = await prisma.attachment.findUniqueOrThrow({ where: { id: newFile.id } });
    expect(oldRow.thumbnailKey).not.toBeNull();
    expect(await getStorage().stat(oldRow.storageKey)).not.toBeNull();
    await prisma.attachment.update({
      where: { id: oldRow.id },
      data: { createdAt: daysAgo(120) },
    });
    const oldMessage = await prisma.message.create({
      data: {
        groupId: world.groupId,
        authorMembershipId: world.member.membershipId,
        kind: 'IMAGE',
        attachmentId: oldRow.id,
        createdAt: daysAgo(120),
      },
    });

    const result = await purgeExpiredContent(now);

    expect(result.attachments).toBeGreaterThanOrEqual(1);
    expect(result.files).toBeGreaterThanOrEqual(2);
    expect(await getStorage().stat(oldRow.storageKey)).toBeNull();
    expect(await getStorage().stat(oldRow.thumbnailKey!)).toBeNull();
    expect(await prisma.attachment.findUnique({ where: { id: oldRow.id } })).toBeNull();
    expect(await prisma.message.findUnique({ where: { id: oldMessage.id } })).toBeNull();
    // The recent file is untouched.
    expect(await getStorage().stat(newRow.storageKey)).not.toBeNull();
    expect(await prisma.attachment.findUnique({ where: { id: newRow.id } })).not.toBeNull();
  });

  it('keeps an attachment whose file could not be removed, and tries again on the next run', async () => {
    const file = await uploadFile(world.member, world.groupId, {
      kind: 'IMAGE',
      mime: 'image/png',
      bytes: FILES.png(),
    });
    const prisma = getPrisma();
    await prisma.attachment.update({ where: { id: file.id }, data: { createdAt: daysAgo(200) } });
    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: file.id } });
    const storage = getStorage();
    const remove = vi.spyOn(storage, 'remove').mockRejectedValue(new Error('bucket unavailable'));

    const failed = await purgeExpiredContent(now);
    expect(failed.failedFiles).toBeGreaterThanOrEqual(1);
    expect(failed.more).toBe(true);
    expect(await prisma.attachment.findUnique({ where: { id: row.id } })).not.toBeNull();
    expect(await storage.stat(row.storageKey)).not.toBeNull();

    remove.mockRestore();
    await purgeExpiredContent(now);
    expect(await prisma.attachment.findUnique({ where: { id: row.id } })).toBeNull();
    expect(await storage.stat(row.storageKey)).toBeNull();
  });
});

describe('files that cannot be removed', () => {
  it('keeps the message of a file that could not be removed until the file is gone', async () => {
    const file = await uploadFile(world.member, world.groupId, {
      kind: 'IMAGE',
      mime: 'image/jpeg',
      bytes: FILES.jpeg(),
    });
    const prisma = getPrisma();
    await prisma.attachment.update({ where: { id: file.id }, data: { createdAt: daysAgo(130) } });
    const kept = await prisma.message.create({
      data: {
        groupId: world.groupId,
        authorMembershipId: world.member.membershipId,
        kind: 'IMAGE',
        attachmentId: file.id,
        createdAt: daysAgo(130),
      },
    });
    const storage = getStorage();
    const remove = vi.spyOn(storage, 'remove').mockRejectedValue(new Error('bucket unavailable'));

    await purgeExpiredContent(now);
    // The text does not disappear while its file can still be fetched.
    expect(await prisma.message.findUnique({ where: { id: kept.id } })).not.toBeNull();

    remove.mockRestore();
    await purgeExpiredContent(now);
    expect(await prisma.message.findUnique({ where: { id: kept.id } })).toBeNull();
    expect(await prisma.attachment.findUnique({ where: { id: file.id } })).toBeNull();
  });

  it('does not let one stuck file hold up the files behind it', async () => {
    const prisma = getPrisma();
    const stuck = await uploadFile(world.member, world.groupId, {
      kind: 'IMAGE',
      mime: 'image/png',
      bytes: FILES.png(),
    });
    const other = await uploadFile(world.member, world.groupId, {
      kind: 'IMAGE',
      mime: 'image/jpeg',
      bytes: FILES.jpeg(),
    });
    await prisma.attachment.update({ where: { id: stuck.id }, data: { createdAt: daysAgo(300) } });
    await prisma.attachment.update({ where: { id: other.id }, data: { createdAt: daysAgo(200) } });
    const stuckRow = await prisma.attachment.findUniqueOrThrow({ where: { id: stuck.id } });
    const storage = getStorage();
    const original = storage.remove.bind(storage);
    vi.spyOn(storage, 'remove').mockImplementation((key: string) =>
      key === stuckRow.storageKey ? Promise.reject(new Error('stuck')) : original(key),
    );

    const result = await purgeExpiredContent(now);

    expect(result.more).toBe(true);
    expect(await prisma.attachment.findUnique({ where: { id: stuck.id } })).not.toBeNull();
    expect(await prisma.attachment.findUnique({ where: { id: other.id } })).toBeNull();
    vi.restoreAllMocks();
    await purgeExpiredContent(now);
    expect(await prisma.attachment.findUnique({ where: { id: stuck.id } })).toBeNull();
  });

  it('counts a file that is already gone as removed, even when the driver complains', async () => {
    const prisma = getPrisma();
    const ghost = await prisma.attachment.create({
      data: {
        groupId: world.groupId,
        uploaderMembershipId: world.member.membershipId,
        kind: 'DOCUMENT',
        mime: 'application/pdf',
        sizeBytes: 10,
        storageKey: `groups/${world.groupId}/ghost-${Date.now()}.pdf`,
        createdAt: daysAgo(250),
      },
    });
    vi.spyOn(getStorage(), 'remove').mockRejectedValue(new Error('404 not found'));
    const result = await purgeExpiredContent(now);
    expect(result.failedFiles).toBe(0);
    expect(await prisma.attachment.findUnique({ where: { id: ghost.id } })).toBeNull();
  });
});

describe('notices and finished job rows', () => {
  it('deletes old in-app notices and finished job rows, never a waiting job', async () => {
    const prisma = getPrisma();
    const notice = (createdAt: Date) =>
      prisma.notification.create({
        data: {
          userId: world.member.id,
          groupId: world.groupId,
          category: 'MONEY',
          titleFr: 'Titre',
          titleEn: 'Title',
          bodyFr: 'Annonce : réunion samedi',
          bodyEn: 'Announcement: meeting Saturday',
          createdAt,
        },
      });
    const oldNotice = await notice(daysAgo(95));
    const freshNotice = await notice(daysAgo(5));
    const job = (status: string, tag: string) =>
      prisma.deploymentJob.create({
        data: {
          id: randomUUID(),
          name: 'retention.test',
          jobKey: `${tag}-${randomUUID()}`,
          payload: {},
          runAt: daysAgo(100),
          status,
        },
      });
    const done = await job('SUCCEEDED', 'done');
    const dead = await job('DEAD', 'dead');
    const waiting = await job('PENDING', 'waiting');
    const recent = await job('SUCCEEDED', 'recent');
    // updatedAt is set by the database layer on writes: set it with SQL so the test controls it.
    const old = daysAgo(100);
    await prisma.$executeRaw`UPDATE "DeploymentJob" SET "updatedAt" = ${old} WHERE "id" IN (${done.id}::uuid, ${dead.id}::uuid, ${waiting.id}::uuid)`;

    const result = await purgeExpiredContent(now);

    expect(result.notifications).toBeGreaterThanOrEqual(1);
    expect(result.jobs).toBeGreaterThanOrEqual(2);
    expect(await prisma.notification.findUnique({ where: { id: oldNotice.id } })).toBeNull();
    expect(await prisma.notification.findUnique({ where: { id: freshNotice.id } })).not.toBeNull();
    expect(await prisma.deploymentJob.findUnique({ where: { id: done.id } })).toBeNull();
    expect(await prisma.deploymentJob.findUnique({ where: { id: dead.id } })).toBeNull();
    expect(await prisma.deploymentJob.findUnique({ where: { id: waiting.id } })).not.toBeNull();
    expect(await prisma.deploymentJob.findUnique({ where: { id: recent.id } })).not.toBeNull();
  });
});

describe('purging the agent history and upload slots', () => {
  it('deletes old agent exchanges and clears the summaries written from them, keeping recent exchanges', async () => {
    const prisma = getPrisma();
    const conversation = await prisma.agentConversation.create({
      data: {
        userId: world.member.id,
        groupId: world.groupId,
        channel: 'PRIVATE',
        rollingSummary: 'Résumé de vieux échanges',
      },
    });
    const dormant = await prisma.agentConversation.create({
      data: {
        userId: world.admin.id,
        groupId: world.groupId,
        channel: 'PRIVATE',
        rollingSummary: 'Résumé oublié',
      },
    });
    await prisma.agentConversation.updateMany({
      where: { id: { in: [conversation.id, dormant.id] } },
      data: { updatedAt: daysAgo(150) },
    });
    // Prisma sets updatedAt itself on updates; write it with SQL so the test controls it.
    await prisma.$executeRaw`UPDATE "AgentConversation" SET "updatedAt" = ${daysAgo(150)} WHERE "id" IN (${conversation.id}::uuid, ${dormant.id}::uuid)`;
    const oldOne = await prisma.agentMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: 'vieux',
        createdAt: daysAgo(100),
      },
    });
    const newOne = await prisma.agentMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: 'récent',
        createdAt: daysAgo(3),
      },
    });

    const result = await purgeExpiredContent(now);

    expect(result.agentMessages).toBeGreaterThanOrEqual(1);
    expect(await prisma.agentMessage.findUnique({ where: { id: oldOne.id } })).toBeNull();
    expect(await prisma.agentMessage.findUnique({ where: { id: newOne.id } })).not.toBeNull();
    // A summary may repeat what the deleted exchanges said: it is cleared, for a conversation
    // that lost exchanges and for a dormant one alike; the recent exchange itself stays.
    const rebuilt = await prisma.agentConversation.findUniqueOrThrow({
      where: { id: conversation.id },
    });
    const cleared = await prisma.agentConversation.findUniqueOrThrow({ where: { id: dormant.id } });
    expect(rebuilt.rollingSummary).toBeNull();
    expect(cleared.rollingSummary).toBeNull();
  });

  it('removes the file of an old upload that never completed, and its slot', async () => {
    const prisma = getPrisma();
    const key = `groups/${world.groupId}/never-completed-${Date.now()}.pdf`;
    const ticket = await prisma.uploadTicket.create({
      data: {
        userId: world.member.id,
        groupId: world.groupId,
        kind: 'DOCUMENT',
        declaredMime: 'application/pdf',
        maxBytes: 1024,
        storageKey: key,
        expiresAt: daysAgo(199),
        createdAt: daysAgo(200),
      },
    });
    const result = await purgeExpiredContent(now);
    expect(result.uploadTickets).toBeGreaterThanOrEqual(1);
    expect(await prisma.uploadTicket.findUnique({ where: { id: ticket.id } })).toBeNull();
  });
});

describe('what is never purged', () => {
  it('leaves the ledger, proposals and audit trail alone and logs only counts', async () => {
    const prisma = getPrisma();
    const before = {
      ledger: await prisma.ledgerTransaction.count(),
      proposals: await prisma.proposal.count(),
      groups: await prisma.group.count(),
    };
    await message(daysAgo(365), 'tout vieux secret');
    await purgeExpiredContent(now);
    expect(await prisma.ledgerTransaction.count()).toBe(before.ledger);
    expect(await prisma.proposal.count()).toBe(before.proposals);
    expect(await prisma.group.count()).toBe(before.groups);
    const trail = await prisma.auditLog.findFirst({
      where: { action: 'retention.purge' },
      orderBy: { createdAt: 'desc' },
    });
    expect(trail?.actorUserId).toBeNull();
    expect(JSON.stringify(trail?.details)).not.toContain('secret');
  });
});
