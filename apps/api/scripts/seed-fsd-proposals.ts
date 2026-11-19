import 'dotenv/config';
import { getPrisma } from '../src/lib/prisma';
import { hashPhone } from '../src/lib/crypto';

async function main() {
  const prisma = getPrisma();
  const group = await prisma.group.findFirst({
    where: { name: 'Njangi des Collègues' },
    include: {
      memberships: {
        include: { user: true },
      },
      cycles: {
        include: { rounds: true },
      },
      ledgerTransactions: {
        orderBy: { seq: 'asc' },
        take: 5,
      },
    },
  });

  if (!group) {
    throw new Error('Group "Njangi des Collègues" not found');
  }

  const membersByName = new Map(group.memberships.map((m) => [m.user.name, m]));
  const nkam = membersByName.get('Nkam Ticha')!;
  const carine = membersByName.get('Carine Fotso')!;
  const paul = membersByName.get('Paul Mbarga')!;
  const joel = membersByName.get('Joël Ndi')!;
  const mireille = membersByName.get('Mireille Atangana')!;
  const sandrine = membersByName.get('Sandrine Ewane')!;
  const brice = membersByName.get('Brice Tchakounté')!;
  const nadege = membersByName.get('Nadège Nkeng')!;
  const ivo = membersByName.get('Ivo Fon')!;
  const larissa = membersByName.get('Larissa Ngono')!;

  const allActiveIds = group.memberships.filter((m) => m.status === 'ACTIVE').map((m) => m.id);
  const now = new Date();
  const in3Days = new Date(now.getTime() + 72 * 3600 * 1000);
  const in24Hours = new Date(now.getTime() + 24 * 3600 * 1000);

  console.log(`Seeding FSD proposals for "${group.name}" (${group.id})...`);

  // 1. RULE_CHANGE (already exists or ensure)
  const existingRule = await prisma.proposal.findFirst({
    where: { groupId: group.id, type: 'RULE_CHANGE', status: 'OPEN' },
  });
  if (!existingRule) {
    await prisma.proposal.create({
      data: {
        groupId: group.id,
        type: 'RULE_CHANGE',
        payload: { changes: { lateFine: 500 }, from: { lateFine: 1000 } },
        reason: 'Des amendes plus légères pour les retards',
        proposerMembershipId: nkam.id,
        secret: false,
        thresholdKind: 'TWO_THIRDS',
        eligibleMembershipIds: allActiveIds,
        opensAt: now,
        closesAt: in3Days,
        status: 'OPEN',
      },
    });
    console.log(' + RULE_CHANGE proposal created');
  } else {
    console.log(' = RULE_CHANGE proposal already exists');
  }

  // 2. MEMBER_ADD
  const existingMemberAdd = await prisma.proposal.findFirst({
    where: { groupId: group.id, type: 'MEMBER_ADD', status: 'OPEN' },
  });
  if (!existingMemberAdd) {
    const inviteePhone = '+237699000202';
    await prisma.proposal.create({
      data: {
        groupId: group.id,
        type: 'MEMBER_ADD',
        payload: {
          inviteeName: 'Hervé Nana',
          phoneHash: hashPhone(inviteePhone),
        },
        reason: 'Intégrer Hervé Nana au prochain cycle',
        proposerMembershipId: carine.id,
        secret: false,
        thresholdKind: 'MAJORITY',
        eligibleMembershipIds: allActiveIds,
        opensAt: now,
        closesAt: in3Days,
        status: 'OPEN',
      },
    });
    console.log(' + MEMBER_ADD proposal created');
  } else {
    console.log(' = MEMBER_ADD proposal already exists');
  }

  // 3. MEMBER_REMOVE (secret vote)
  const existingMemberRemove = await prisma.proposal.findFirst({
    where: { groupId: group.id, type: 'MEMBER_REMOVE', status: 'OPEN' },
  });
  if (!existingMemberRemove) {
    const eligibleWithoutLarissa = allActiveIds.filter((id) => id !== larissa.id);
    await prisma.proposal.create({
      data: {
        groupId: group.id,
        type: 'MEMBER_REMOVE',
        payload: { membershipId: larissa.id },
        reason: 'Absences répétées non justifiées et retards',
        proposerMembershipId: sandrine.id,
        subjectMembershipId: larissa.id,
        secret: true,
        thresholdKind: 'MAJORITY',
        eligibleMembershipIds: eligibleWithoutLarissa,
        opensAt: now,
        closesAt: in3Days,
        status: 'OPEN',
      },
    });
    console.log(' + MEMBER_REMOVE proposal created (secret)');
  } else {
    console.log(' = MEMBER_REMOVE proposal already exists');
  }

  // 4. ROTATION_CHANGE
  const existingRotation = await prisma.proposal.findFirst({
    where: { groupId: group.id, type: 'ROTATION_CHANGE', status: 'OPEN' },
  });
  if (!existingRotation) {
    await prisma.proposal.create({
      data: {
        groupId: group.id,
        type: 'ROTATION_CHANGE',
        payload: { swap: [sandrine.id, brice.id] },
        reason: 'Échange de tour entre Sandrine et Brice pour motif familial',
        proposerMembershipId: brice.id,
        secret: false,
        thresholdKind: 'MAJORITY',
        eligibleMembershipIds: allActiveIds,
        mustApproveMembershipIds: [sandrine.id, brice.id],
        opensAt: now,
        closesAt: in3Days,
        status: 'OPEN',
      },
    });
    console.log(' + ROTATION_CHANGE proposal created');
  } else {
    console.log(' = ROTATION_CHANGE proposal already exists');
  }

  // 5. ADMIN_CHANGE (secret vote)
  const existingAdminChange = await prisma.proposal.findFirst({
    where: { groupId: group.id, type: 'ADMIN_CHANGE', status: 'OPEN' },
  });
  if (!existingAdminChange) {
    await prisma.proposal.create({
      data: {
        groupId: group.id,
        type: 'ADMIN_CHANGE',
        payload: { membershipId: carine.id },
        reason: 'Transmission du rôle d’administrateur à Carine Fotso',
        proposerMembershipId: paul.id,
        subjectMembershipId: carine.id,
        secret: true,
        thresholdKind: 'MAJORITY',
        eligibleMembershipIds: allActiveIds,
        opensAt: now,
        closesAt: in3Days,
        status: 'OPEN',
      },
    });
    console.log(' + ADMIN_CHANGE proposal created (secret)');
  } else {
    console.log(' = ADMIN_CHANGE proposal already exists');
  }

  // 6. ADMIN_LOAN
  const existingAdminLoan = await prisma.proposal.findFirst({
    where: { groupId: group.id, type: 'ADMIN_LOAN', status: 'OPEN' },
  });
  if (!existingAdminLoan) {
    const loan = await prisma.loan.create({
      data: {
        groupId: group.id,
        membershipId: nkam.id,
        principal: 50_000,
        months: 2,
        ratePermille: 50,
        interest: 5_000,
        feeEstimated: 500,
        totalDue: 55_000,
        status: 'REQUESTED',
      },
    });

    const eligibleWithoutNkam = allActiveIds.filter((id) => id !== nkam.id);
    const p = await prisma.proposal.create({
      data: {
        groupId: group.id,
        type: 'ADMIN_LOAN',
        payload: {
          loanId: loan.id,
          membershipId: nkam.id,
          amount: 50_000,
          months: 2,
        },
        reason: 'Demande de prêt de 50 000 FCFA sur 2 mois par l’administrateur',
        proposerMembershipId: nkam.id,
        subjectMembershipId: nkam.id,
        secret: false,
        thresholdKind: 'MAJORITY',
        eligibleMembershipIds: eligibleWithoutNkam,
        opensAt: now,
        closesAt: in3Days,
        status: 'OPEN',
      },
    });

    await prisma.loan.update({
      where: { id: loan.id },
      data: { proposalId: p.id },
    });
    console.log(' + ADMIN_LOAN proposal created');
  } else {
    console.log(' = ADMIN_LOAN proposal already exists');
  }

  // 7. SOLIDARITY_PAYOUT
  const existingSolidarity = await prisma.proposal.findFirst({
    where: { groupId: group.id, type: 'SOLIDARITY_PAYOUT', status: 'OPEN' },
  });
  if (!existingSolidarity) {
    const p = await prisma.proposal.create({
      data: {
        groupId: group.id,
        type: 'SOLIDARITY_PAYOUT',
        payload: {
          recipientMembershipId: paul.id,
          event: 'DEUIL',
          amount: 25_000,
          note: 'Assistance pour les obsèques familiales de Paul',
        },
        reason: 'Soutien de la caisse de secours suite au deuil de Paul',
        proposerMembershipId: mireille.id,
        secret: false,
        thresholdKind: 'MAJORITY',
        eligibleMembershipIds: allActiveIds,
        opensAt: now,
        closesAt: in24Hours,
        status: 'OPEN',
      },
    });

    await prisma.solidarityRequest.create({
      data: {
        groupId: group.id,
        requesterMembershipId: mireille.id,
        recipientMembershipId: paul.id,
        event: 'DEUIL',
        amount: 25_000,
        note: 'Assistance pour les obsèques familiales de Paul',
        status: 'VOTING',
        proposalId: p.id,
      },
    });
    console.log(' + SOLIDARITY_PAYOUT proposal created (24h)');
  } else {
    console.log(' = SOLIDARITY_PAYOUT proposal already exists');
  }

  // 8. FINE_WAIVER
  const existingFineWaiver = await prisma.proposal.findFirst({
    where: { groupId: group.id, type: 'FINE_WAIVER', status: 'OPEN' },
  });
  if (!existingFineWaiver) {
    const round1 = group.cycles[0]?.rounds[0];
    const fineObligation = await prisma.obligation.create({
      data: {
        groupId: group.id,
        membershipId: joel.id,
        kind: 'FINE',
        amount: 1_000,
        dueAt: now,
        status: 'DUE',
        roundId: round1?.id ?? null,
      },
    });

    const eligibleWithoutJoel = allActiveIds.filter((id) => id !== joel.id);
    await prisma.proposal.create({
      data: {
        groupId: group.id,
        type: 'FINE_WAIVER',
        payload: {
          obligationId: fineObligation.id,
          membershipId: joel.id,
          amount: 1_000,
          roundNumber: 1,
        },
        reason: 'Problème de connexion Mobile Money indépendant de sa volonté',
        proposerMembershipId: ivo.id,
        subjectMembershipId: joel.id,
        secret: false,
        thresholdKind: 'MAJORITY',
        eligibleMembershipIds: eligibleWithoutJoel,
        opensAt: now,
        closesAt: in3Days,
        status: 'OPEN',
      },
    });
    console.log(' + FINE_WAIVER proposal created');
  } else {
    console.log(' = FINE_WAIVER proposal already exists');
  }

  // 9. EARLY_EXIT
  const existingEarlyExit = await prisma.proposal.findFirst({
    where: { groupId: group.id, type: 'EARLY_EXIT', status: 'OPEN' },
  });
  if (!existingEarlyExit) {
    const eligibleWithoutNadege = allActiveIds.filter((id) => id !== nadege.id);
    await prisma.proposal.create({
      data: {
        groupId: group.id,
        type: 'EARLY_EXIT',
        payload: { membershipId: nadege.id },
        reason: 'Mutation professionnelle imprévue à l’étranger',
        proposerMembershipId: nadege.id,
        subjectMembershipId: nadege.id,
        secret: false,
        thresholdKind: 'MAJORITY',
        eligibleMembershipIds: eligibleWithoutNadege,
        opensAt: now,
        closesAt: in3Days,
        status: 'OPEN',
      },
    });
    console.log(' + EARLY_EXIT proposal created');
  } else {
    console.log(' = EARLY_EXIT proposal already exists');
  }

  // 10. LEDGER_CORRECTION
  const existingLedgerCorr = await prisma.proposal.findFirst({
    where: { groupId: group.id, type: 'LEDGER_CORRECTION', status: 'OPEN' },
  });
  if (!existingLedgerCorr) {
    await prisma.proposal.create({
      data: {
        groupId: group.id,
        type: 'LEDGER_CORRECTION',
        payload: {
          seq: 1,
          correction: 'Rectification du libellé de l’écriture de lancement',
        },
        reason: 'Harmonisation comptable des libellés du registre',
        proposerMembershipId: ivo.id,
        secret: false,
        thresholdKind: 'TWO_THIRDS',
        eligibleMembershipIds: allActiveIds,
        opensAt: now,
        closesAt: in3Days,
        status: 'OPEN',
      },
    });
    console.log(' + LEDGER_CORRECTION proposal created');
  } else {
    console.log(' = LEDGER_CORRECTION proposal already exists');
  }

  // Also add 1 closed (passed) proposal so closed section is shown as well
  const existingClosed = await prisma.proposal.findFirst({
    where: { groupId: group.id, status: 'PASSED' },
  });
  if (!existingClosed) {
    const past = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const closed = new Date(now.getTime() - 4 * 24 * 3600 * 1000);
    await prisma.proposal.create({
      data: {
        groupId: group.id,
        type: 'RULE_CHANGE',
        payload: {
          changes: { solidarityContribution: 1000 },
          from: { solidarityContribution: 500 },
        },
        reason: 'Renforcement du fonds de secours mutuel',
        proposerMembershipId: nkam.id,
        secret: false,
        thresholdKind: 'TWO_THIRDS',
        eligibleMembershipIds: allActiveIds,
        yesCount: 8,
        noCount: 1,
        opensAt: past,
        closesAt: closed,
        closedAt: closed,
        appliedAt: closed,
        status: 'PASSED',
        effect: {
          fr: 'Cotisation de secours passée à 1 000 FCFA',
          en: 'Solidarity contribution set to 1,000 FCFA',
        },
      },
    });
    console.log(' + Closed PASSED proposal created');
  }

  console.log('\nAll 10 FSD proposal types seeded successfully for Njangi des Collègues!');
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
