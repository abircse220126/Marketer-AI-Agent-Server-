const buildRagContext = (docs) => {
  return docs
    .map((d) => JSON.stringify(d.data))
    .join("\n\n");
};

module.exports = buildRagContext;
