import {it,expect} from 'vitest';
import {content,scripts,send} from './helpers';
import {createGame,restoreGame} from '../packages/application/index';
import {serialize,deserialize} from '../packages/persistence/index';
import {canonical} from '../packages/contracts/validation';
const identity={name:'  Rowan Vale  ',ancestry:'Human',heritage:'Lowlander',origin:'Meridia',background:'Artisan',motivation:'Settlement',portrait:'artisan'};
async function start(){const e=await createGame(content,scripts,'story-test','story:start.crossroads');await send(e,{type:'characters.create',payload:identity});await send(e,{type:'quests.accept',payload:{questDefinitionId:'story:quest.stranger'}});return e;}
it('creates one controlled newcomer without an owned estate or workforce',async()=>{
 const e=await start(),s=e.snapshot();expect(Object.values(s.characters).filter(c=>c.controlled)).toHaveLength(1);expect(s.characters[s.playerCharacterId!]).toMatchObject({name:'Rowan Vale',locationId:'story:location.veybridge',skills:{smithing:100}});expect(s.haven.facilities).toEqual({});expect(s.world.unlocked).not.toContain('story:deed.briarfield');
});
it('rejects invalid combinations, empty names and identity recreation atomically',async()=>{
 const e=await createGame(content,scripts,'story-test','story:start.crossroads');let before=canonical(e.snapshot());
 for(const payload of [{...identity,heritage:'Stormborn'},{...identity,name:'   '}]){expect((await e.dispatch({id:'bad',type:'characters.create',payload})).ok).toBe(false);expect(canonical(e.snapshot())).toBe(before);}
 await send(e,{type:'characters.create',payload:identity});before=canonical(e.snapshot());expect((await e.dispatch({id:'again',type:'characters.create',payload:identity})).ok).toBe(false);expect(canonical(e.snapshot())).toBe(before);
});
it('requires identity, quest acceptance, valid choice and ordered interactions',async()=>{
 const e=await start(),before=canonical(e.snapshot());
 expect((await e.dispatch({id:'out-of-order',type:'story.interact',payload:{interactionId:'story:interaction.borin',choiceId:'rights'}})).ok).toBe(false);
 expect((await e.dispatch({id:'wrong-choice',type:'story.interact',payload:{interactionId:'story:interaction.gate',choiceId:'cheat'}})).ok).toBe(false);expect(canonical(e.snapshot())).toBe(before);
});
it('tracks commissioned conversations, persists choices and claims once after reload',async()=>{
 let e=await start();
 for(const [scene,choice] of [['gate','register'],['mara','settle'],['borin','rights']])await send(e,{type:'story.interact',payload:{interactionId:'story:interaction.'+scene,choiceId:choice}});
 expect(e.snapshot().quests['quest-1']).toMatchObject({status:'ready',progress:{gate:1,mara:1,borin:1}});
 expect(e.snapshot().notifications.filter(n=>n.message.startsWith('Objective completed'))).toHaveLength(3);
 e=restoreGame(await deserialize(await serialize(e.snapshot()),content),content,scripts);
 const before=canonical(e.snapshot());expect((await e.dispatch({id:'repeat-scene',type:'story.interact',payload:{interactionId:'story:interaction.gate',choiceId:'register'}})).ok).toBe(false);expect(canonical(e.snapshot())).toBe(before);
 await send(e,{type:'quests.claim',payload:{questId:'quest-1'}});expect(e.snapshot().quests['quest-1'].rewardReceipt).toBeTruthy();expect((await e.dispatch({id:'double',type:'quests.claim',payload:{questId:'quest-1'}})).ok).toBe(false);expect(e.snapshot().characters[e.snapshot().playerCharacterId!].identity?.responses['story:interaction.borin']).toBe('rights');
});
it('requires physical access and an accepted quest before conversations',async()=>{
 const e=await createGame(content,scripts,'story-test','story:start.crossroads');await send(e,{type:'characters.create',payload:identity});
 expect((await e.dispatch({id:'no-quest',type:'story.interact',payload:{interactionId:'story:interaction.gate',choiceId:'register'}})).ok).toBe(false);
 await send(e,{type:'quests.accept',payload:{questDefinitionId:'story:quest.stranger'}});
 const s=e.snapshot();s.characters[s.playerCharacterId!].locationId='story:location.briarfield';const away=restoreGame(s,content,scripts);
 expect((await away.dispatch({id:'away',type:'story.interact',payload:{interactionId:'story:interaction.gate',choiceId:'register'}})).ok).toBe(false);
});
