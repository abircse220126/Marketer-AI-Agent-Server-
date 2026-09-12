const createEmbedding = async (ai, text) => {
  console.log("Embedding Creating...");

  const result = await ai.models.embedContent({
    model: "gemini-embedding-2",
    contents: text,
  });

  console.log("Embedding Success");

  return result.embeddings[0].values;
};

module.exports = createEmbedding;
