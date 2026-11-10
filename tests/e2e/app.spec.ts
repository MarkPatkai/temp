import {test,expect} from '@playwright/test';
test('story registration, dialogue, tracked objectives and claim work through the HUD',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await expect(page.getByRole('heading',{name:'A stranger at the gates'})).toBeVisible();
 await expect(page.getByRole('banner',{name:'Resources and time'})).toBeVisible();
 await page.getByRole('button',{name:'Begin character creation'}).click();const dialog=page.getByRole('dialog',{name:'Character creation'});
 await dialog.getByLabel('Name',{exact:true}).fill('Aster Vale');await dialog.getByRole('button',{name:'Enter Veybridge'}).click();await expect(dialog).not.toBeVisible();
 await page.getByRole('button',{name:'Present your registration.'}).click();await expect(page.getByRole('status')).not.toHaveText('Working…');
 await page.getByRole('button',{name:/A home for those willing/}).click();await page.getByRole('button',{name:'I want a place to settle.'}).click();await expect(page.getByRole('status')).not.toHaveText('Working…');
 await page.getByRole('button',{name:/Read the fine print/}).click();await page.getByRole('button',{name:'Ask about passage and existing land rights.'}).click();await expect(page.getByRole('status')).not.toHaveText('Working…');
 await expect(page.locator('.toast')).toHaveCount(3);await page.getByRole('button',{name:'Quests',exact:true}).click();
 const quest=page.locator('section').filter({has:page.getByRole('heading',{name:'A Stranger at the Gates',exact:true})});
 await quest.getByRole('button',{name:'Claim reward',exact:true}).click();await expect(quest.getByText('completed',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Open player character'}).click();await expect(page.getByRole('dialog',{name:'Player character'})).toContainText('Aster Vale');await page.getByRole('button',{name:'Close dialog'}).click();
 await page.getByRole('button',{name:'Open companions'}).click();await expect(page.getByRole('dialog',{name:'Companions'})).toContainText('Mara Vell');await page.getByRole('button',{name:'Close dialog'}).click();
 await page.screenshot({path:'test-results/crossroads.png',fullPage:true});expect(errors).toEqual([]);
});
test('saves identity and quest progress locally and exports a portable save',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Begin character creation'}).click();await page.getByLabel('Name',{exact:true}).fill('Sable');await page.getByRole('button',{name:'Enter Veybridge'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
 await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('status')).toContainText('Saved');await page.getByRole('button',{name:'+10 ticks'}).click();await page.getByRole('button',{name:'Load',exact:true}).click();await expect(page.getByRole('status')).toContainText('restored');
 const promise=page.waitForEvent('download');await page.getByRole('button',{name:'Export',exact:true}).click();const d=await promise;const stream=await d.createReadStream();let text='';for await(const chunk of stream!)text+=chunk;const s=JSON.parse(text).state;expect(s.characters[s.playerCharacterId].name).toBe('Sable');expect(s.clock.tick).toBe(0);
});
test('notification preferences, outliner and responsive shell remain usable',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.getByRole('heading',{name:'A stranger at the gates'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.getByRole('complementary',{name:'Facilities and parties'})).toContainText('No facilities');
 await page.getByRole('button',{name:'Hide popups'}).click();await expect(page.getByRole('button',{name:'Show popups'})).toBeVisible();await page.getByRole('button',{name:/Reports/}).click();await expect(page.getByRole('heading',{name:'Reports & achievements'})).toBeVisible();
});
test('isolated engine verification still runs from developer diagnostics',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Diagnostics',exact:true}).click();await page.getByRole('button',{name:'Verify architecture',exact:true}).click();await expect(page.getByRole('status')).toContainText('verification passed');await expect(page.locator('.check')).toHaveCount(7);
});
