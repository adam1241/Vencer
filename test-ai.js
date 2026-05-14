const payload = {
  goalName: "Learn to code",
  motivation: "Change career",
  currentSituation: "Beginner",
  trackingMode: "points",
  trackingTarget: 30,
  deadline: "2026-12-31",
  difficulty: "Balanced",
  preferredDays: "Every day",
  constraints: "1 hour a day"
};

fetch('http://192.168.1.163:3001/api/ai/generate-plan', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
.then(res => {
  const parsed = JSON.parse(res);
  if (parsed.error) console.log("FAIL:", parsed.error);
  else console.log("SUCCESS! Title:", parsed.planTitle);
})
.catch(console.error);
