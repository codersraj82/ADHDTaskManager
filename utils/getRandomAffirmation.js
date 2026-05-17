const toArray = (input) => (Array.isArray(input) ? input.filter(Boolean) : []);

export const getRandomAffirmation = (pool, options = {}) => {
  const source = toArray(pool);
  if (!source.length) return "";

  const excluded = new Set([
    ...(options.exclude || []),
    options.previous,
  ].filter(Boolean));

  const candidates = source.filter((item) => !excluded.has(item));
  const fallback = candidates.length ? candidates : source;
  return fallback[Math.floor(Math.random() * fallback.length)];
};

export const getSectionAffirmations = (sectionKeys, pool, previousMap = {}) => {
  const keys = toArray(sectionKeys);
  return keys.reduce((acc, sectionKey) => {
    acc[sectionKey] = getRandomAffirmation(pool, {
      previous: previousMap[sectionKey],
    });
    return acc;
  }, {});
};
