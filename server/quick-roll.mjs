const defaultRng = () => Math.random();

function itemLabel(item) {
  return item.nameZh || item.nameEn;
}

function pickOne(items, rng = defaultRng) {
  if (items.length === 0) {
    throw new Error("随机池为空");
  }
  const index = Math.min(items.length - 1, Math.floor(rng() * items.length));
  return items[index];
}

function pickManyUnique(items, count, rng = defaultRng) {
  if (items.length < count) {
    throw new Error(`随机池数量不足，需要 ${count} 个，当前只有 ${items.length} 个`);
  }

  const available = [...items];
  const picked = [];
  while (picked.length < count) {
    const index = Math.min(available.length - 1, Math.floor(rng() * available.length));
    const [item] = available.splice(index, 1);
    picked.push(item);
  }
  return picked;
}

export function createQuickRoll(catalog, rng = defaultRng) {
  const stratagems = catalog.stratagems.filter(
    (item) => item.enabled && item.selectable && item.kind !== "yellow",
  );
  const primaries = catalog.weapons.filter((item) => item.enabled && item.slot === "primary");
  const secondaries = catalog.weapons.filter((item) => item.enabled && item.slot === "secondary");
  const grenades = catalog.grenades.filter((item) => item.enabled);

  return {
    faction: pickOne(catalog.factions, rng),
    stratagems: pickManyUnique(stratagems, 4, rng),
    primary: pickOne(primaries, rng),
    secondary: pickOne(secondaries, rng),
    grenade: pickOne(grenades, rng),
  };
}

export function formatQuickRollText(roll) {
  const stratagemLines = roll.stratagems.map((item, index) => `${index + 1}. ${itemLabel(item)}`);

  return [
    "地狱潜兵2 随机配装",
    "",
    `敌方阵营：${itemLabel(roll.faction)}`,
    "",
    "战备：",
    ...stratagemLines,
    "",
    "武器：",
    `主武器：${itemLabel(roll.primary)}`,
    `副武器：${itemLabel(roll.secondary)}`,
    `手雷：${itemLabel(roll.grenade)}`,
  ].join("\n");
}

export function createQuickRollText(catalog, rng = defaultRng) {
  return formatQuickRollText(createQuickRoll(catalog, rng));
}
