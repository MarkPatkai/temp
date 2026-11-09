function run(ctx)
  return { ctx.effects.request("quests.claim", { questId = ctx.subject.quest_instance_id }) }
end
