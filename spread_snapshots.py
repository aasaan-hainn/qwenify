
import datetime
from backend_server.mongodb import channel_stats_collection

print("Spreading snapshots over the last 14 days...")

# Fetch all snapshots sorted by time
snapshots = list(channel_stats_collection.find().sort("recordedAt", 1))

base_date = datetime.datetime.now()

# Update each snapshot to be 1 day apart
for i, snapshot in enumerate(reversed(snapshots)):
    # i=0 is today, i=1 is yesterday, etc.
    new_date = base_date - datetime.timedelta(days=i)
    
    channel_stats_collection.update_one(
        {"_id": snapshot["_id"]},
        {"$set": {"recordedAt": new_date}}
    )
    print(f"Updated snapshot {snapshot['_id']} to {new_date.date()}")

print("Done! Refresh your frontend to see the time filter in action.")
