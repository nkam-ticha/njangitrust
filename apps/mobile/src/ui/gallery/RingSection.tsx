// Gallery: the NjangiRing in every size and state, both motions on demand, 3 to 50 members
// (DESIGN_SYSTEM.md section 6).
import { useState } from 'react';
import { View } from 'react-native';
import { space } from '@/theme';
import { NjangiRing, type RingMember } from '../ring/NjangiRing';
import { ringLayout } from '../ring/ringGeometry';
import { Button } from '../buttons/Button';
import { Txt } from '../primitives/Txt';
import { GallerySection, Specimen } from './GallerySection';
import { PAUL, ringMembers, syntheticRing } from './fixtures';

const collectedOf = (ms: RingMember[]) => ms.filter((m) => m.state === 'paid').length * 10000;

export function RingSection() {
  const [members, setMembers] = useState<RingMember[]>(ringMembers);
  const [n, setN] = useState(24);
  const [opened, setOpened] = useState<string | null>(null);
  const dense = syntheticRing(n);
  const bidding = ringMembers.map((m) => ({ ...m, isBeneficiary: false }));

  return (
    <GallerySection title="NjangiRing">
      <Specimen label="large 280 (tap a dot) / header 64 / thumbnail 40">
        <NjangiRing
          size="large"
          members={members}
          collected={collectedOf(members)}
          target={100000}
          round={4}
          roundsTotal={10}
          meId={PAUL}
          onMemberPress={(id) =>
            setOpened(members.find((m) => m.membershipId === id)?.name ?? null)
          }
        />
        {opened ? (
          <Txt variant="secondary" color="textSecondary">
            {opened}
          </Txt>
        ) : null}
        <View style={{ flexDirection: 'row', gap: space.s6, alignItems: 'center' }}>
          <NjangiRing
            size="header"
            members={members}
            collected={collectedOf(members)}
            target={100000}
            round={4}
            roundsTotal={10}
          />
          <NjangiRing
            size="thumb"
            members={members}
            collected={collectedOf(members)}
            target={100000}
            round={4}
            roundsTotal={10}
          />
        </View>
      </Specimen>
      <Specimen label="motions: 600 ms pulse on Paul, then the raffia sweep">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }}>
          <Button
            variant="secondary"
            label="Paul pays"
            onPress={() =>
              setMembers((ms) =>
                ms.map((m) => (m.membershipId === PAUL ? { ...m, state: 'paid' } : m)),
              )
            }
          />
          <Button
            variant="secondary"
            label="Everyone pays"
            onPress={() => setMembers((ms) => ms.map((m) => ({ ...m, state: 'paid' })))}
          />
          <Button variant="text" label="Reset round 4" onPress={() => setMembers(ringMembers)} />
        </View>
      </Specimen>
      <Specimen label="bidding mode before the close: empty seat at 12 o'clock">
        <NjangiRing
          size="largeSmall"
          members={bidding}
          collected={70000}
          target={100000}
          round={6}
          roundsTotal={10}
        />
      </Specimen>
      <Specimen
        label={`density: ${n} members, large r = ${Math.round(ringLayout('large', n).r * 10) / 10}, header ${ringLayout('header', n).segments ? 'arcs' : 'dots'}, thumbnail ${ringLayout('thumb', n).segments ? 'arcs' : 'dots'}`}
      >
        <View style={{ flexDirection: 'row', gap: space.s2 }}>
          <Button variant="secondary" label="− 1" onPress={() => setN((v) => Math.max(3, v - 1))} />
          <Button
            variant="secondary"
            label="+ 1"
            onPress={() => setN((v) => Math.min(50, v + 1))}
          />
          <Button variant="text" label="3" onPress={() => setN(3)} />
          <Button variant="text" label="50" onPress={() => setN(50)} />
        </View>
        <NjangiRing
          size="large"
          members={dense}
          collected={collectedOf(dense)}
          target={n * 10000}
          round={1}
          roundsTotal={n}
          animate={false}
        />
        <View style={{ flexDirection: 'row', gap: space.s6, alignItems: 'center' }}>
          <NjangiRing
            size="header"
            members={dense}
            collected={collectedOf(dense)}
            target={n * 10000}
            round={1}
            roundsTotal={n}
          />
          <NjangiRing
            size="thumb"
            members={dense}
            collected={collectedOf(dense)}
            target={n * 10000}
            round={1}
            roundsTotal={n}
          />
        </View>
      </Specimen>
    </GallerySection>
  );
}
