const openai = require('../openai');

async function generateJobDescription({ title, budget, payment_type, location, category, skills, duration }) {
  const prompt = `Create a professional job posting for a freelance marketplace.

Job Title: "${title}"
Budget: $${budget} ${payment_type}
Location: ${location || 'Anywhere'}
Category: ${category || 'General'}
Duration: ${duration || 'Ongoing'}

${skills && skills.length > 0 ? `Required Skills: ${skills.join(', ')}` : ''}

Write a compelling job description that:
1. Starts with an engaging hook about the opportunity
2. Clearly describes the project scope and deliverables
3. Mentions the budget and payment structure
4. Specifies required skills and experience level
5. Includes a call-to-action for applicants
6. Uses professional, persuasive tone
7. Is concise (300-500 words maximum)

Return only the job description text, no formatting or quotes.`;
  
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 500,
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenAI job description error:', error);
    throw error;
  }
}

module.exports = { generateJobDescription };