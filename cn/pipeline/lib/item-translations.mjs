// 只生成显示索引。原生词缀身份和官方底材能力在离线阶段消歧，浏览器不推导机制。
export function compileItemTranslations({ core, sourceRows, nativeForms, contexts, reviewed, report, locale, normalize }) {
  const itemScopes = { bases: {}, uniques: {} };
  const forms = [...nativeForms.values()].flatMap(value => [...value.values()]);
  const selections = reviewed.itemStatSelections || [];
  for (const selection of selections) {
    if (!['weapon', 'spirit'].includes(selection.property) || !selection.evidence?.path || !selection.source) throw new Error('物品词缀选择缺少官方依据');
    for (const kind of ['local', 'global']) {
      const ids = selection[kind];
      if (!Array.isArray(ids) || !ids.length) throw new Error('物品词缀选择缺少有序属性身份');
      const matches = forms.filter(form => form.evidence.path.toLowerCase() === 'data/statdescriptions/stat_descriptions.csd'
        && form.source.toLowerCase() === selection.source.toLowerCase() && JSON.stringify(form.evidence.stats) === JSON.stringify(ids));
      const values = new Set(matches.map(form => form.translated));
      if (values.size !== 1) throw new Error(`物品词缀选择未通过原生保真验证：${locale}/${selection.source}/${kind}`);
      const scope = `item-stat:${selection.property}:${kind}`;
      contexts[scope] ||= {};
      if (contexts[scope][selection.source]) throw new Error(`重复物品词缀选择：${scope}/${selection.source}`);
      contexts[scope][selection.source] = [...values][0];
      report.provenance[JSON.stringify([locale, scope, selection.source])] = { kind: 'game-stat-identity', forms: matches.map(form => form.evidence), selection: selection.evidence };
    }
  }
  for (const [base, properties] of Object.entries(core.itemBases || {}).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    itemScopes.bases[base] = [...new Set(selections.map(selection => `item-stat:${selection.property}:${properties[selection.property] === true ? 'local' : 'global'}`))];
  }
  const names = new Map(core.rows.filter(row => row.category === 'flavour_name').map(row => [row.id, row.text]));
  const gameFlavours = new Map(), displayBases = new Map();
  for (const row of sourceRows) {
    if (row.table !== 'FlavourText' || row.field !== 'Text') continue;
    if (!gameFlavours.has(row.id)) gameFlavours.set(row.id, []);
    gameFlavours.get(row.id).push(row);
  }
  for (const row of core.rows) {
    if (row.category !== 'unique_display' || !row.context?.item?.title) continue;
    const title = row.context.item.title;
    if (!displayBases.has(title)) displayBases.set(title, new Map());
    const texts = displayBases.get(title);
    if (!texts.has(row.text)) texts.set(row.text, new Set());
    texts.get(row.text).add(row.context.item.base);
  }
  for (const row of core.rows.filter(row => row.category === 'flavour_text')) {
    const title = names.get(row.id);
    const matches = (gameFlavours.get(row.id) || []).filter(source => normalize(source.en).replace(/\s+/g, ' ') === normalize(row.text).replace(/\s+/g, ' '));
    const values = new Set(matches.map(source => normalize(source.translated)));
    if (!title || values.size !== 1) continue;
    const scope = `item-flavour:${row.id}`;
    contexts[scope] = { [row.text]: [...values][0] };
    report.provenance[JSON.stringify([locale, scope, row.text])] = { kind: 'game', table: 'FlavourText', id: row.id, field: 'Text' };
    for (const base of displayBases.get(title)?.get(row.text) || []) {
      const key = JSON.stringify([title, base]);
      itemScopes.uniques[key] ||= [];
      if (!itemScopes.uniques[key].includes(scope)) itemScopes.uniques[key].push(scope);
    }
  }
  return itemScopes;
}
