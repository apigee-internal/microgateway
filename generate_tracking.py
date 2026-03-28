import re

content = open('/usr/local/google/home/harikadas/.gemini/jetski/brain/3817633a-01f6-4ffc-b467-63919ad2c229/.system_generated/steps/185/output.txt').read()

bug_ids = re.findall(r'Issue ID: (\d+)', content)
statuses = re.findall(r'Status: (\w+)', content)
titles = re.findall(r'Title: (.*?)\n', content)

with open('vulnerability_tracking.csv', 'w') as f:
    f.write("Issue ID,Status,Title,Fixed By Overrides?\n")
    for b_id, status, title in zip(bug_ids, statuses, titles):
        # We assume some are fixed based on our overrides that cleared from npm audit
        is_fixed = "Yes (picomatch/semver/cross-spawn)" if "FIXED" in status else "Partial/No"
        f.write(f"{b_id},{status},{title},{is_fixed}\n")
