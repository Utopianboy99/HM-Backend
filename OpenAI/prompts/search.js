const openai = require('../openai');

async function generateSearchResults({ query, jobs }) {
  const jobSummaries = jobs
    .map(job => `
Job: ${job.title}
Description: ${job.description.substring(0, 200)}${job.description.length > 200 ? '...' : ''}
Budget: $${job.budget}
Category: ${job.category || 'Any'}
Status: ${job.status}
Location: ${job.location_city || 'Anywhere'}
${job.slots > 1 ? `Slots: ${job.slots}` : ''}
`).join('');

  const prompt = `You are an AI search expert for a freelance marketplace.

Search Query: "${query}"

Available Jobs:
${jobSummaries || 'No jobs available.'}

Task: Rank the jobs from most relevant to least relevant based on:
1. Semantic match between query and job title/description
2. Budget compatibility (if query mentions a budget range)
3. Category relevance
4. Job status (prefer open/in_progress over completed/cancelled)
5. Geographic relevance (if location is mentioned in query)

Return a ranked list (1-5) with a 1-2 sentence justification for each rank. Format as:
1. [Job Title] - [Justification]
2. [Job Title] - [Justification]
3. [Job Title] - [Justification]
4. [Job Title] - [Justification]
5. [Job Title] - [Justification]

If fewer than 5 jobs are available, rank those that are available and note "Only N jobs available."`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenAI search error:', error);
    throw error;
  }
}

module.exports = { generateSearchResults };