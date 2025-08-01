export interface NodeType {
    name: string;
    node_type: string;
    properties: Record<string, string>;
}

export interface EdgeType {
    name: string;
    from_node: string;
    to_node: string;
    properties: Record<string, string>;
}

export interface SchemaInfo {
    nodes: NodeType[];
    edges: EdgeType[];
}

class SchemaService {
    private baseUrl = 'http://127.0.0.1:8080/api';

    async getSchema(): Promise<SchemaInfo> {
        try {
            const response = await fetch(`${this.baseUrl}/schema`);
            if (!response.ok) {
                throw new Error(`Failed to fetch schema: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching schema:', error);
            return {
                nodes: [],
                edges: []
            };
        }
    }

    async executeQuery(queryName: string): Promise<any> {
        try {
            const response = await fetch(`${this.baseUrl}/query/${queryName}`);

            if (!response.ok) {
                throw new Error(`Query failed: ${response.statusText}`);
            }

            const responseText = await response.text();
            console.log('Raw response:', responseText);

            let result;
            try {
                result = JSON.parse(responseText);
            } catch (parseError) {
                console.error('JSON parse error:', parseError);
                console.error('Response text:', responseText);
                throw new Error(`Failed to parse response as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
            }

            if (result.error) {
                throw new Error(result.error);
            }

            return {
                data: result,
                queryName
            };
        } catch (error) {
            console.error('Error executing query:', error);
            throw error;
        }
    }
}

export const schemaService = new SchemaService();