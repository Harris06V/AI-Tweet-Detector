Test Cases

Use these to test if the detector works right.

Should detect (80%+ confidence):

1. AI word spam
"Let me delve into this intricate topic. In today's multifaceted digital landscape, it's crucial to leverage a holistic paradigm. The nuanced framework showcases a robust ecosystem."

2. AI phrases
"It's not about the quantity, it's about the quality. It's important to note that in the ever-evolving realm of technology, we must navigate the landscape carefully."

3. Too much punctuation
"The solution is clear: understand the problem—analyze the data—implement the fix—measure the results. This approach: systematic; effective; proven."

4. Generic replies
"Great point! This is so important. Couldn't agree more—everyone needs to see this. Well said! Absolutely this."

5. Formal lists
"1. First, acknowledge the complexity
2. Second, understand the mechanisms
3. Third, implement solutions
4. Finally, measure outcomes"


Should maybe detect (60-79% confidence):

6. Mixed style
"This is actually pretty cool tbh. The way it leverages modern tech is fascinating. It's not perfect but it's definitely a step in the right direction."

7. Hashtag spam
"Amazing content! #tech #innovation #AI #future #digital #marketing #success #growth #trending"


Should NOT detect (under 60%):

8. Casual talk
"lol this is hilarious can't believe they actually did that. bruh moment fr fr"

9. Normal tweet
"Just finished reading this book. Really enjoyed it! The characters were well-developed and the plot kept me engaged."

10. News format
"BREAKING: New study shows coffee consumption linked to improved focus. Researchers analyzed 10,000 participants over 5 years."


How to test:

Go to twitter.com with the extension on and see if these get flagged correctly. If too many false positives, raise the threshold. If missing obvious AI, lower it.
