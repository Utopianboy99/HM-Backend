const openai = require('../openai');

async function matchFreelancersToJob({ jobTitle, jobDescription, budget, requiredSkills, freelancerProfiles }) {
  const freelancerSummaries = freelancerProfiles
    .map(freelancer => `
Freelancer: ${freelancer.full_name}
Skills: ${freelancer.skills?.join(', ') || 'N/A'}
Experience: ${freelancer.freelancer_profile?.experience_level || 'Not specified'}
Hourly Rate: $${freelancer.freelancer_profile?.hourly_rate || 'Not specified'}
Location: ${freelancer.location_city || 'Not specified'}
Rating: ${freelancer.avg_rating || 'N/A'}${freelancer.total_reviews > 0 ? ` (${freelancer.total_reviews} reviews)` : ''}
`).join('');

  const prompt = `You are an AI matching expert for a freelance marketplace.

Job Posting:
Title: "${jobTitle}"
Description: "${jobDescription}"
Budget: $${budget}
Required Skills: ${requiredSkills || 'Any'}

Available Freelancers:
${freelancerSummaries}

Task: Rank the freelancers from best match to worst match based on:
1. Skills overlap with job requirements
2. Relevant experience level
3. Competitive pricing relative to budget
4. Geographic compatibility
5. Track record (ratings and number of reviews)

Return a ranked list (1-5) with a brief justification for each rank. Keep each justification to 1-2 sentences. Format as:
1. [Freelancer Name] - [Justification]
2. [Freelancer Name] - [Justification]
3. [Freelancer Name] - [Justification]
4. [Freelancer Name] - [Justification]
5. [Freelancer Name] - [Justification]

If fewer than 5 freelancers are available, rank those that are available and note "Only N freelancers available."`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenAI match error:', error);
    throw error;
  }
}

module.exports = { matchFreelancersToJob };