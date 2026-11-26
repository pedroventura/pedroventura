# Cabecera del perfil

La cabecera conserva la imagen original del blog y superpone textos y el diagrama vectorial mediante HTML y CSS. El tercio derecho queda libre para el logotipo y el nombre. Todos los elementos permanecen dentro del banner, también al reducir su anchura.

- Fuente editable: `index.html` y `header.css`.
- Fondo original: https://www.pedroventura.com/assets/images/banners/logo-header-pv2026.jpg
- SHA-256 del fondo: `179650c511b3cd890582da787a9f3889ca21d77a281d6e4116190239cfe95aec`.
- Exportación del diseño aprobado: `../header.png`. El README usa esta exportación porque GitHub no admite las capas CSS de la fuente HTML.

Para regenerarla, ejecutar desde la raíz del repositorio:

```sh
node tools/render-header.mjs
```

El renderizador usa Node.js y Google Chrome instalados, sirve únicamente la fuente local y no instala dependencias. Exporta la cabecera a 848 píxeles CSS de ancho y escala 2, como la composición aprobada.
