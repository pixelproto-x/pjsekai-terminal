export function cardUnit(card, gameCharacterUnits = []) {
  if (card?.gameCharacterUnitId != null) {
    const exact = gameCharacterUnits.find((row) => Number(row.id) === Number(card.gameCharacterUnitId));
    if (exact) return exact.unit || "";
  }
  const matches = gameCharacterUnits.filter((row) => Number(row.gameCharacterId) === Number(card?.characterId));
  if (card?.unit) {
    const exact = matches.find((row) => row.unit === card.unit);
    if (exact) return exact.unit;
  }
  return matches.length === 1 ? matches[0].unit || "" : "";
}

export function characterUnits(characterId, gameCharacterUnits = []) {
  return [...new Set(gameCharacterUnits
    .filter((row) => Number(row.gameCharacterId) === Number(characterId))
    .map((row) => row.unit)
    .filter(Boolean))];
}

export function calculateCardEventBonus(card, eventId, eventDeckBonuses = [], gameCharacterUnits = []) {
  if (!card || eventId == null) return null;
  const rules = eventDeckBonuses.filter((row) => Number(row.eventId) === Number(eventId));
  if (!rules.length) return null;

  const unitId = Number(card.gameCharacterUnitId) || null;
  const unit = cardUnit(card, gameCharacterUnits);
  const characterUnitIds = gameCharacterUnits
    .filter((row) => Number(row.gameCharacterId) === Number(card.characterId) && (!unit || row.unit === unit))
    .map((row) => Number(row.id));

  const matching = rules.filter((rule) => {
    if (rule.gameCharacterUnitId != null) {
      const requiredId = Number(rule.gameCharacterUnitId);
      if (unitId !== null ? requiredId !== unitId : !characterUnitIds.includes(requiredId)) return false;
    }
    if (rule.cardAttr != null && rule.cardAttr !== card.attr) return false;
    return true;
  });

  return matching.length
    ? Math.max(...matching.map((row) => Number(row.bonusRate) || 0))
    : 0;
}

export function calculateCardRarityBonus(card, masterRank = 0, eventRarityBonusRates = []) {
  if (!card) return null;
  const rank = Math.max(0, Math.min(5, Number(masterRank) || 0));
  const row = eventRarityBonusRates.find((item) =>
    item.cardRarityType === card.cardRarityType && Number(item.masterRank) === rank
  );
  return row ? Number(row.bonusRate) || 0 : null;
}
