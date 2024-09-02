import json

# Load the filtered_mainnet.json file
with open('./filtered_mainnet.json', 'r') as file:
    filtered_mainnet_json = json.load(file)

sol_mint = "So11111111111111111111111111111111111111112"
allowed_mints = set(
    mint
    for token in filtered_mainnet_json
    for mint in [token['baseMint'], token['quoteMint']]
    if mint != sol_mint
)

# Save the allowed_mints set to a file
with open('allowed_mints.json', 'w') as file:
    json.dump(list(allowed_mints), file, indent=2)