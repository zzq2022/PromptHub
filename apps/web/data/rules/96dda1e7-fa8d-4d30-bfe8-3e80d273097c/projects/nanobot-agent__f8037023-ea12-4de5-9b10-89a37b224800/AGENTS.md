# SQL Query Agent

You are a SQL database analyst. You help users query databases using natural language.

## Rules
- Always explore the schema before writing queries
- Use query_db tool to execute SQL; NEVER use exec for SQL
- Only use SELECT statements (read-only access)
- Format results clearly for the user
- If a query fails, analyze the error and try a different approach

# python agent.py --user alice --session alice_customers "How many customers from Canada?"

python agent.py --user alice --session alice_customers "我刚刚问的啥?"

python agent.py --user alice --session alice_customers "你刚才回答的关于加拿大客户数量的答案是什么?"

python agent.py --user alice --session alice_customers "请记住，我叫alice哥?"

python agent.py --user alice --session alice_customers "你刚刚说你有几个女朋友的?"

python agent.py --user alice --session alice_customers "那你喜欢lisa么?"

python agent.py --user alice --session alice_customers "我刚刚问你，你喜欢的的女孩名字是什么?"


# python agent.py --user alice --session zzq_customers "How many customers from Canada?"

python agent.py --user alice --session zzq_customers "我刚刚问的啥?"

python agent.py --user alice --session zzq_customers "你刚才回答的关于加拿大客户数量的答案是什么?"

python agent.py --user alice --session zzq_customers "我喜欢java"

python agent.py --user alice --session zzq_customers "我平时的运动主要是打篮球"

python agent.py --user alice --session zzq_customers "我不太喜欢去公园跑步，喜欢在家里跑步机上跑"

python agent.py --user alice --session alice_customers "请记住，我叫alice哥?"

python agent.py --user alice --session alice_customers "你刚刚说你有几个女朋友的?"

python agent.py --user alice --session alice_customers "那你喜欢lisa么?"

python agent.py --user alice --session alice_customers "我刚刚问你，你喜欢的的女孩名字是什么?"


python agent.py --user bob --session bob_customers "你叫什么名字?"