const openai = require('../openai');

async function generateCoverLetter({ freelancerName, freelancerSkills, jobTitle, jobDescription, proposedRate, freelancerExperience }) {
  const prompt = `Write a personalized cover letter for a freelance job application.

Freelancer Profile:
- Name: ${freelancerName}
- Skills: ${freelancerSkills.join(', ') || 'Not specified'}
- Experience: ${freelancerExperience || 'Not specified'}

Job Posting:
- Job Title: "${jobTitle}"
- Description: "${jobDescription}"
- Proposed Rate: $${proposedRate}

Requirements:
1. Personalize the letter to the specific job and freelancer
2. Highlight 2-3 most relevant skills from the freelancer's profile
3. Explain why the freelancer is interested in this type of work
4. Propose the suggested rate with justification
5. Include a brief track record/example of relevant work
6. End with a professional call-to-action
7. Keep it concise (200-300 words)
8. Use a professional yet enthusiastic tone

Return only the cover letter text, no formatting, quotes, or "Dear Hiring Manager:" header.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 400,
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenAI cover letter error:', error);
    throw error;
  }
}

module.exports = { generateCoverLetter };