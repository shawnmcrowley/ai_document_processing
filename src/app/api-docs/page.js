    
     import React from 'react';
     import ReactSwagger from '../components/next-swagger';
     import swaggerSpec from '../configs/swaggerConfig';

     const Docs = () => {
        return (
        <section className="grid-containerbg-white pt-8 rounded-2xl" style={{
          width: "90%",
          maxWidth: "1200px",
          margin: "0 auto",
          paddingBottom: "2rem",
          paddingLeft: "2rem",
          paddingRight: "2rem"

      }}>
          <ReactSwagger spec={swaggerSpec} />
        </section>
      )
              
     };
     
     export default Docs;
