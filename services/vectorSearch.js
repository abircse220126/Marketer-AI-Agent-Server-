const cosineSimilarity = (a, b) => {
  let dot = 0;

  let normA = 0;

  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];

    normA += a[i] * a[i];

    normB += b[i] * b[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const vectorSearch = async (collection, embedding) => {
  const docs = await collection.find().toArray();

  return docs
    .map((doc) => ({
      ...doc,

      similarity: cosineSimilarity(embedding, doc.embedding),
    }))

    .sort((a, b) => b.similarity - a.similarity)

    .slice(0, 5);
};

module.exports = vectorSearch;
