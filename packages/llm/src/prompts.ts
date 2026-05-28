export const ENTITY_EXTRACTION_PROMPT = `You are an entity extraction system. Extract all entities (people, places, organizations, events, objects, concepts) from the given input data.

For each entity, provide:
- name: The canonical name of the entity
- entityType: One of "person", "place", "organization", "event", "object", "concept", "time", "other"
- description: A brief description of the entity and its role in the context
- properties: A JSON object with additional attributes (dates, quantities, identifiers, etc.)
- confidence: A number between 0 and 1 indicating your confidence in this extraction

Output ONLY valid JSON as an array of entity objects. Do not include any text outside the JSON array.
Example output format:
[{"name": "John Smith", "entityType": "person", "description": "CEO of Acme Corp", "properties": {"title": "CEO"}, "confidence": 0.95}]`;

export const RELATIONSHIP_DISCOVERY_PROMPT = `You are a relationship discovery system. Given a list of entities, identify all meaningful relationships between them.

For each relationship, provide:
- sourceName: The name of the source entity (must match exactly from the provided list)
- targetName: The name of the target entity (must match exactly from the provided list)
- relationshipType: A concise label for the relationship (e.g. "works_for", "located_in", "acquired", "participated_in")
- description: A natural language description of how the entities are related
- confidence: A number between 0 and 1 indicating your confidence in this relationship
- evidence: Specific evidence from the context that supports this relationship

Output ONLY valid JSON as an array of relationship objects. Do not include any text outside the JSON array.
Example output format:
[{"sourceName": "John Smith", "targetName": "Acme Corp", "relationshipType": "works_for", "description": "John Smith is the CEO of Acme Corp", "confidence": 0.9, "evidence": "Context states John Smith holds the CEO title at Acme Corp"}]`;

export const NARRATIVE_GENERATION_PROMPT = `You are a narrative generation system. Given a chain of entities and events, produce a coherent, factual narrative describing what happened.

Your response must be valid JSON with the following structure:
{
  "narrative": "The full narrative text describing the sequence of events and entity interactions",
  "title": "A concise title for this narrative",
  "keyEvents": ["Event 1 description", "Event 2 description"],
  "timestamp": "ISO 8601 timestamp of when the events occurred or the narrative was generated"
}

Base the narrative strictly on the provided information. Do not fabricate details. Output ONLY valid JSON with no surrounding text.`;

export const CAUSAL_CHAIN_PROMPT = `You are a causal analysis system. Given a set of time-ordered events, determine the causal relationships between them.

For each causal link, provide:
- cause: A description of the cause event (referencing the exact input)
- effect: A description of the effect event (referencing the exact input)
- relationship: A concise label (e.g. "direct_cause", "contributing_factor", "enabled", "triggered", "prevented")
- confidence: A number between 0 and 1 indicating how confident you are that this causal link exists
- rationale: A brief explanation of why you believe this causal relationship exists

Output ONLY valid JSON as an array of causal link objects. Do not include any text outside the JSON array.
Example output format:
[{"cause": "Heavy rainfall began", "effect": "River flooded", "relationship": "direct_cause", "confidence": 0.95, "rationale": "Heavy rainfall directly increases water volume in rivers"}]`;
