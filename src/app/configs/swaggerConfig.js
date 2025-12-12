import swaggerJSDoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.4',
    info: {
      title: 'Open API Documentation',
      version: '1.0.0',
      description:
        "This is the Open API documentation for the AI Document Processing application. It provides endpoints for uploading and parsing PDF documents, generating embeddings, and managing vector databases.",
      contact: {
        name: 'Shawn M. Crowley',
        email: 'shawn.crowley@lycra.com'
      }
    },
    license: {
      name: 'Apache 2.0'
    },

    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development Server'
      }
    ],
       components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [],
  },
  apis: ['./src/app/api/**/*.js'], // Path to API routes
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;