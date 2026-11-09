import { GameStateSchema, type GameState } from '../contracts/schema';
import { requireThat, type ContentPort } from '../contracts/ports';
import { validate } from '../contracts/validation';

export function assertState(value: unknown, content: ContentPort): asserts value is GameState {
  const s = validate(GameStateSchema, value, 'game state');
  requireThat(s.contentFingerprint === content.fingerprint, 'CONTENT_MISMATCH', 'Save requires the exact content pack');
  requireThat(s.playerCharacterId === null || s.characters[s.playerCharacterId]?.controlled, 'PLAYER_CHARACTER', 'Designated PC must be controlled');
  requireThat(Object.values(s.inventory).filter(i => i.location.kind === 'storage').length <= s.haven.storageCapacity, 'STORAGE_FULL', 'Storage capacity exceeded');
  const ids = new Set<string>();
  for (const c of Object.values(s.characters)) {
    requireThat(!ids.has(c.id), 'STATE_ID', 'Duplicate character identity'); ids.add(c.id);
    content.get(c.definitionId, 'character'); content.get(c.locationId, 'location');
    requireThat(c.hp <= c.maxHp && (c.hp > 0 || !c.conscious), 'HEALTH_INVALID', 'Invalid HP or consciousness');
  }
  for (const [id, c] of Object.entries(s.characters)) requireThat(id === c.id, 'STATE_ID', 'Character key differs from identity');
  const partyMembers = new Set<string>();
  for (const [id, party] of Object.entries(s.parties)) {
    content.get(party.locationId, 'location');
    requireThat(party.id === id && party.members.length > 0 && party.members.length <= 6 && new Set(party.members).size === party.members.length, 'PARTY_STATE', 'Invalid party');
    for (const member of party.members) {
      requireThat(s.characters[member]?.controlled && !partyMembers.has(member), 'PARTY_MEMBERSHIP', 'Character belongs to multiple parties or is uncontrolled');
      requireThat(s.characters[member].locationId === party.locationId && party.rows[member], 'PARTY_LOCATION', 'Party member location/formation differs');
      partyMembers.add(member);
    }
    requireThat((party.mode === 'travel') === !!s.travel[id], 'TRAVEL_STATE', 'Party and journey disagree');
    requireThat((party.mode === 'combat') === Object.values(s.combats).some(b => b.partyId === id && b.status === 'active'), 'COMBAT_STATE', 'Party and battle disagree');
    if (party.mode === 'encounter') { requireThat(party.encounterId, 'ENCOUNTER_STATE', 'Encounter ID missing'); content.get(party.encounterId, 'encounter'); }
  }
  const equipped = new Set<string>();
  for (const [key, item] of Object.entries(s.inventory)) {
    const def = content.get(item.definitionId, 'item');
    requireThat(key === item.id && item.quantity <= def.stackLimit, 'ITEM_STATE', 'Invalid item identity or stack');
    requireThat(!item.ownerId || !!s.characters[item.ownerId], 'OWNER_INVALID', 'Item owner missing');
    if (item.reservedBy) requireThat(item.location.kind === 'storage' && s.jobs.orders[item.reservedBy]?.status === 'running', 'RESERVATION_INVALID', 'Orphan item reservation');
    if (item.location.kind === 'equipped') {
      const location = item.location, loadouts = s.equipment[location.characterId];
      requireThat(s.characters[location.characterId] && item.quantity === 1 && def.equipSlot === location.slot && !item.reservedBy,
        'EQUIPMENT_STATE', 'Invalid equipped item');
      requireThat(loadouts?.[loadouts.active][location.slot] === item.id, 'EQUIPMENT_STATE', 'Equipped item differs from active loadout');
      requireThat(item.ownerId === null || item.ownerId === location.characterId, 'OWNER_INVALID', 'Equipped item belongs to someone else'); equipped.add(item.id);
    }
  }
  for (const [characterId, loadouts] of Object.entries(s.equipment)) {
    requireThat(s.characters[characterId], 'EQUIPMENT_CHARACTER', 'Loadout character missing');
    for (const [slot, itemId] of Object.entries(loadouts[loadouts.active])) {
      const item = s.inventory[itemId];
      requireThat(item?.location.kind === 'equipped' && item.location.characterId === characterId && item.location.slot === slot && equipped.has(itemId), 'LOADOUT_INVALID', 'Active loadout references an unequipped item');
    }
  }
  const workers = new Set<string>();
  for (const [characterId, assignment] of Object.entries(s.jobs.assignments)) requireThat(s.characters[characterId]?.controlled && s.haven.facilities[assignment.facilityId], 'ASSIGNMENT_INVALID', 'Assignment reference missing');
  for (const [id, facility] of Object.entries(s.haven.facilities)) { requireThat(id === facility.id, 'FACILITY_STATE', 'Facility key mismatch'); content.get(facility.definitionId, 'facility'); }
  for (const order of Object.values(s.jobs.orders)) {
    content.get(order.definitionId, order.kind === 'craft' ? 'recipe' : 'research');
    requireThat(s.haven.facilities[order.facilityId] && order.work <= order.required, 'ORDER_STATE', 'Invalid work order');
    if (order.status === 'running') {
      requireThat(order.workerId && s.characters[order.workerId]?.controlled && !workers.has(order.workerId), 'WORKER_CONFLICT', 'Worker has conflicting execution'); workers.add(order.workerId);
    } else requireThat(order.workerId === null, 'WORKER_STATE', 'Inactive order has a worker');
  }
  for (const journey of Object.values(s.travel)) {
    const party = s.parties[journey.partyId];
    requireThat(party && journey.edgeIndex < journey.route.length, 'TRAVEL_STATE', 'Invalid route progress');
    let from = party.locationId;
    for (const id of journey.route.slice(journey.edgeIndex)) {
      const edge = content.get(id, 'connection'); requireThat(edge.from === from || edge.to === from, 'ROUTE_INVALID', 'Disconnected saved route'); from = edge.from === from ? edge.to : edge.from;
    }
    requireThat(journey.progress < content.get(journey.route[journey.edgeIndex], 'connection').ticks, 'TRAVEL_STATE', 'Invalid edge progress');
  }
  const combatants = new Set<string>();
  for (const b of Object.values(s.combats)) {
    content.get(b.encounterId, 'encounter'); requireThat(s.parties[b.partyId], 'COMBAT_STATE', 'Battle party missing');
    const participants = [...b.allies, ...b.enemies];
    requireThat(b.allies.length === s.parties[b.partyId].members.length && b.allies.every(id => s.parties[b.partyId].members.includes(id)), 'COMBAT_PARTY', 'Battle allies differ from persistent party');
    requireThat(new Set(participants).size === participants.length && participants.every(id => s.characters[id] && b.rows[id]), 'COMBAT_STATE', 'Invalid participants');
    requireThat(b.initiative.every(id => participants.includes(id)) && new Set(b.initiative).size === b.initiative.length, 'COMBAT_STATE', 'Invalid initiative');
    if (b.status === 'active') {
      requireThat(b.turnIndex < b.initiative.length && s.characters[b.initiative[b.turnIndex]].conscious && !b.escaped.includes(b.initiative[b.turnIndex]), 'COMBAT_TURN', 'Invalid current actor');
      for (const id of participants) { requireThat(!combatants.has(id), 'COMBAT_CONFLICT', 'Character in two active battles'); combatants.add(id); }
    }
  }
  for (const q of Object.values(s.quests)) {
    const def = content.get(q.definitionId, 'quest'); requireThat(q.acceptedSequence <= s.lastEventSequence, 'QUEST_STATE', 'Quest acceptance is in the future');
    requireThat((q.status === 'completed') === !!q.rewardReceipt, 'QUEST_RECEIPT', 'Quest receipt differs from completion');
    for (const [id, progress] of Object.entries(q.progress)) requireThat(def.objectives.some(o => o.id === id && progress <= o.amount), 'QUEST_PROGRESS', 'Invalid quest progress');
  }
  for (const [id, m] of Object.entries(s.markets)) { content.get(id, 'market'); requireThat(!m.negotiatorId || s.characters[m.negotiatorId]?.controlled, 'MARKET_STATE', 'Invalid negotiator'); for (const itemId of Object.keys(m.stock)) content.get(itemId, 'item'); }
  for (const c of Object.values(s.contracts)) requireThat(s.characters[c.characterId]?.category === 'subcontractor', 'CONTRACT_STATE', 'Contract character missing');
  for (const r of Object.values(s.recruitment)) { content.get(r.definitionId, 'recruit'); requireThat(r.characterId === 'external-service' || s.characters[r.characterId], 'RECRUIT_STATE', 'Recruit character missing'); }
  for (const relation of Object.values(s.relationships)) requireThat(s.characters[relation.from] && s.characters[relation.to], 'RELATIONSHIP_STATE', 'Relationship endpoint missing');
  for (const id of s.world.discovered) content.get(id, 'location');
  requireThat(s.events.every(e => e.sequence <= s.lastEventSequence) && s.history.every(e => e.sequence <= s.lastEventSequence), 'EVENT_SEQUENCE', 'Invalid event cursor');
}
