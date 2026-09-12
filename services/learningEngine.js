const learningEngine = async (analysisCollection) => {
  const total = await analysisCollection.countDocuments();

  return {
    totalAnalyses: total,
  };
};

module.exports = learningEngine;
