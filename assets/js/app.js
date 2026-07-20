(function(){
  "use strict";

  /* ===================== STORAGE ===================== */
  const STORAGE_KEY = "meuHobby_funkoCollection_v1";

  function loadCollection(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      // migração: garante categoria e lista em itens antigos
      return parsed.map(i => ({
        id: i.id,
        imagem: i.imagem || "",
        nome: i.nome || "",
        categoria: i.categoria || "",
        caixa: i.caixa || "",
        valor: Number(i.valor) || 0,
        produtoUrl: i.produtoUrl || i.productUrl || "",
        linkPreview: normalizeLinkPreview(i.linkPreview, i.produtoUrl || i.productUrl || ""),
        lista: i.lista === "wishlist" ? "wishlist" : "colecao",
        criadoEm: i.criadoEm || Date.now()
      }));
    }catch(e){
      console.error("Erro ao ler localStorage:", e);
      return [];
    }
  }
  function saveCollection(items){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  let collection = loadCollection();
  let currentList = "colecao"; // lista ativa na galeria: "colecao" | "wishlist"
  let formList = "colecao"; // lista escolhida no formulário
  let galleryPage = 1;
  const MOBILE_PAGE_SIZE = 12;
  const mobileFeedQuery = window.matchMedia("(max-width: 640px)");

  /* ===================== TOAST ===================== */
  const toastEl = document.getElementById("toast");
  let toastTimer;
  function showToast(msg, isError){
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.classList.toggle("error", !!isError);
    toastEl.classList.add("show");
    toastTimer = setTimeout(()=> toastEl.classList.remove("show"), 2600);
  }

  /* ===================== NAVIGATION ===================== */
  const views = document.querySelectorAll(".view");
  const navButtonGroups = [
    document.querySelectorAll("#primaryNav button"),
    document.querySelectorAll("#mobileNav button[data-view]"),
    document.querySelectorAll("#bottomTabbar button")
  ];

  function setActiveView(viewName){
    views.forEach(v => v.classList.toggle("active", v.id === "view-" + viewName));
    const highlightName = viewName === "galeria" ? "inicio" : viewName;
    navButtonGroups.forEach(group=>{
      group.forEach(btn => btn.classList.toggle("active", btn.dataset.view === highlightName));
    });
    closeMobileNav();
    if(viewName === "galeria") renderGaleria();
    if(viewName === "inicio") updateHomeStats();
    if(viewName === "adicionar" && !document.getElementById("editId").value){
      resetForm();
    }
    window.scrollTo({top:0, behavior:"smooth"});
  }

  navButtonGroups.forEach(group=>{
    group.forEach(btn=>{
      btn.addEventListener("click", ()=> setActiveView(btn.dataset.view));
    });
  });

  document.getElementById("goCollection").addEventListener("click", ()=>{
    currentList = "colecao";
    galleryPage = 1;
    setActiveView("galeria");
  });
  document.getElementById("goWishlist").addEventListener("click", ()=>{
    currentList = "wishlist";
    galleryPage = 1;
    setActiveView("galeria");
  });
  document.getElementById("backToHome").addEventListener("click", ()=> setActiveView("inicio"));
  document.getElementById("emptyAddBtn").addEventListener("click", ()=>{
    setFormList(currentList);
    setActiveView("adicionar");
  });

  /* ===================== MOBILE NAV PANEL ===================== */
  const mobileNav = document.getElementById("mobileNav");
  const overlay = document.getElementById("overlay");
  function openMobileNav(){ mobileNav.classList.add("open"); overlay.classList.add("show"); }
  function closeMobileNav(){ mobileNav.classList.remove("open"); overlay.classList.remove("show"); }
  document.getElementById("hamburgerBtn").addEventListener("click", openMobileNav);
  document.getElementById("closePanel").addEventListener("click", closeMobileNav);
  overlay.addEventListener("click", closeMobileNav);

  /* ===================== FORM ===================== */
  const form = document.getElementById("funkoForm");
  const productLinkField = document.getElementById("productLinkField");
  const productUrlInput = document.getElementById("productUrl");
  const imgUrlInput = document.getElementById("imgUrl");
  const imgPreview = document.getElementById("imgPreview");
  const editIdInput = document.getElementById("editId");
  const submitBtn = document.getElementById("submitBtn");
  const cancelEditBtn = document.getElementById("cancelEditBtn");
  const formTitle = document.getElementById("formTitle");
  const toggleColecao = document.getElementById("toggleColecao");
  const toggleWishlist = document.getElementById("toggleWishlist");

  function setFormList(list){
    formList = list;
    toggleColecao.classList.toggle("active", list === "colecao");
    toggleWishlist.classList.toggle("active", list === "wishlist");
    productLinkField.classList.toggle("is-wishlist", list === "wishlist");
    submitBtn.textContent = editIdInput.value
      ? "Salvar alterações"
      : (list === "wishlist" ? "Adicionar à wishlist" : "Salvar na coleção");
  }
  toggleColecao.addEventListener("click", ()=> setFormList("colecao"));
  toggleWishlist.addEventListener("click", ()=> setFormList("wishlist"));

  imgUrlInput.addEventListener("input", updatePreview);
  productUrlInput.addEventListener("paste", ()=>{
    if(formList !== "wishlist") setFormList("wishlist");
  });

  function updatePreview(){
    const url = imgUrlInput.value.trim();
    if(url){
      imgPreview.innerHTML = '<img src="'+ escapeAttr(url) +'" alt="Pré-visualização" onerror="this.parentElement.innerHTML=\'<span>Não foi possível carregar a imagem</span>\'">';
    }else{
      imgPreview.innerHTML = '<span>Pré-visualização da imagem</span>';
    }
  }

  function getValidUrl(value){
    try{
      const url = new URL(value.trim());
      if(!/^https?:$/.test(url.protocol)) return null;
      return url;
    }catch(e){
      return null;
    }
  }

  function nameFromProductUrl(value){
    const url = getValidUrl(value);
    if(!url) return "";
    return url.hostname.replace(/^www\./, "");
  }

  function parseCurrencyText(value){
    if(!value) return 0;
    const match = String(value).match(/(\d{1,3}(?:[.\s]\d{3})*|\d+)(?:,\d{2}|\.\d{2})?/);
    if(!match) return 0;
    const normalized = match[0].replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    return parseFloat(normalized) || 0;
  }

  function previewPrice(data){
    const raw = data && (data.price || data.priceAmount || (data.offer && data.offer.price));
    if(typeof raw === "number") return raw;
    if(raw && typeof raw === "object") return Number(raw.amount || raw.value || raw.price) || 0;
    return parseCurrencyText(raw);
  }

  function normalizeLinkPreview(preview, productUrl){
    const url = getValidUrl(productUrl);
    const host = url ? url.hostname.replace(/^www\./, "") : "";
    if(!preview){
      return productUrl ? {title:host, description:productUrl, image:"", publisher:host, url:productUrl, price:0} : null;
    }
    return {
      title: preview.title || host || "Produto da wishlist",
      description: preview.description || productUrl || "",
      image: preview.image || "",
      publisher: preview.publisher || preview.siteName || host || "",
      url: preview.url || productUrl || "",
      price: Number(preview.price) || 0
    };
  }

  async function fetchLinkPreview(productUrl){
    const fallback = normalizeLinkPreview(null, productUrl);
    try{
      const endpoint = "https://api.microlink.io/?url=" + encodeURIComponent(productUrl);
      const response = await fetch(endpoint, {cache:"no-store"});
      if(!response.ok) return fallback;
      const json = await response.json();
      const data = json && json.data;
      if(!data) return fallback;
      return normalizeLinkPreview({
        title: data.title,
        description: data.description,
        image: data.image && data.image.url,
        publisher: data.publisher || data.author || "",
        url: data.url || productUrl,
        price: previewPrice(data)
      }, productUrl);
    }catch(err){
      console.warn("Não foi possível gerar preview do link:", err);
      return fallback;
    }
  }

  function resetForm(){
    form.reset();
    editIdInput.value = "";
    imgPreview.innerHTML = '<span>Pré-visualização da imagem</span>';
    formTitle.textContent = "Adicionar Funko";
    cancelEditBtn.style.display = "none";
    setFormList(currentList === "wishlist" ? "wishlist" : "colecao");
  }

  cancelEditBtn.addEventListener("click", resetForm);

  form.addEventListener("submit", async function(e){
    e.preventDefault();
    let nome = document.getElementById("nome").value.trim();
    const produtoUrl = productUrlInput.value.trim();
    const hasProductUrl = !!getValidUrl(produtoUrl);
    if(produtoUrl && !hasProductUrl){
      showToast("Informe um link de produto válido ou deixe o campo em branco.", true);
      return;
    }

    const existingItem = editIdInput.value ? collection.find(i=>i.id===editIdInput.value) : null;
    let linkPreview = existingItem && existingItem.linkPreview ? existingItem.linkPreview : null;
    const originalSubmitText = submitBtn.textContent;
    if(formList === "wishlist" && hasProductUrl){
      submitBtn.disabled = true;
      submitBtn.textContent = "Criando preview...";
      linkPreview = await fetchLinkPreview(produtoUrl);
      if(!nome) nome = linkPreview.title || nameFromProductUrl(produtoUrl);
    }else if(!hasProductUrl){
      linkPreview = null;
    }

    if(!nome){
      submitBtn.disabled = false;
      submitBtn.textContent = originalSubmitText;
      showToast(formList === "wishlist" ? "Informe uma descrição ou cole o link do produto." : "Informe uma descrição para o Funko.", true);
      return;
    }

    const typedValue = parseFloat(document.getElementById("valor").value) || 0;

    const item = {
      id: editIdInput.value || crypto.randomUUID(),
      imagem: imgUrlInput.value.trim(),
      nome: nome,
      categoria: document.getElementById("categoria").value.trim(),
      caixa: document.getElementById("boxNumber").value.trim(),
      valor: typedValue || (linkPreview && linkPreview.price) || 0,
      produtoUrl: produtoUrl,
      linkPreview: linkPreview,
      lista: formList,
      criadoEm: editIdInput.value ? (existingItem||{}).criadoEm || Date.now() : Date.now()
    };

    if(editIdInput.value){
      collection = collection.map(i => i.id === item.id ? item : i);
      showToast("Funko atualizado com sucesso!");
    }else{
      collection.push(item);
      showToast(formList === "wishlist" ? "Funko adicionado à wishlist!" : "Funko adicionado à coleção!");
    }
    saveCollection(collection);
    currentList = item.lista;
    submitBtn.disabled = false;
    submitBtn.textContent = originalSubmitText;
    resetForm();
    setActiveView("galeria");
  });

  /* ===================== GRID / RENDER ===================== */
  const gridEl = document.getElementById("grid");
  const emptyState = document.getElementById("emptyState");
  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");
  const categoryFilter = document.getElementById("categoryFilter");
  const statsRow = document.getElementById("statsRow");
  const paginationEl = document.getElementById("pagination");

  function resetGalleryAndRender(){
    galleryPage = 1;
    renderGaleria();
  }
  searchInput.addEventListener("input", resetGalleryAndRender);
  sortSelect.addEventListener("change", resetGalleryAndRender);
  categoryFilter.addEventListener("change", resetGalleryAndRender);
  const onFeedModeChange = ()=>{
    galleryPage = 1;
    if(document.getElementById("view-galeria").classList.contains("active")) renderGaleria();
  };
  if(mobileFeedQuery.addEventListener) mobileFeedQuery.addEventListener("change", onFeedModeChange);
  else mobileFeedQuery.addListener(onFeedModeChange);

  function currency(n){
    return "R$ " + Number(n||0).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
  }
  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function escapeAttr(str){ return escapeHtml(str); }

  function shouldPaginateGallery(){
    return mobileFeedQuery.matches;
  }

  function renderPagination(totalPages){
    if(!shouldPaginateGallery() || totalPages <= 1){
      paginationEl.classList.remove("show");
      paginationEl.innerHTML = "";
      return;
    }
    paginationEl.classList.add("show");
    paginationEl.innerHTML = `
      <button type="button" data-page-action="prev" ${galleryPage === 1 ? "disabled" : ""} aria-label="Página anterior">‹</button>
      <span class="pagination-info">${galleryPage} de ${totalPages}</span>
      <button type="button" data-page-action="next" ${galleryPage === totalPages ? "disabled" : ""} aria-label="Próxima página">›</button>
    `;
    paginationEl.querySelectorAll("button[data-page-action]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const nextPage = btn.dataset.pageAction === "next" ? galleryPage + 1 : galleryPage - 1;
        galleryPage = Math.min(Math.max(nextPage, 1), totalPages);
        renderGaleria();
        gridEl.scrollIntoView({behavior:"smooth", block:"start"});
      });
    });
  }

  async function shareWishlistItem(id){
    const item = collection.find(i => i.id === id);
    if(!item || !item.produtoUrl){
      showToast("Esse item ainda não tem link de produto.", true);
      return;
    }

    const title = item.nome || "Funko da wishlist";
    const text = "Olha esse Funko da minha wishlist:";
    if(navigator.share){
      try{
        await navigator.share({title, text, url:item.produtoUrl});
        return;
      }catch(err){
        if(err && err.name === "AbortError") return;
      }
    }

    const whatsappText = encodeURIComponent(text + "\n" + title + "\n" + item.produtoUrl);
    const opened = window.open("https://wa.me/?text=" + whatsappText, "_blank", "noopener,noreferrer");
    if(!opened && navigator.clipboard){
      try{
        await navigator.clipboard.writeText(title + "\n" + item.produtoUrl);
        showToast("Link copiado para compartilhar no WhatsApp.");
      }catch(err){
        showToast("Não foi possível abrir o compartilhamento.", true);
      }
    }
  }

  function renderCardActions(item){
    return `
      <div class="card-actions">
        ${item.produtoUrl ? `
          <button class="share-btn" title="Compartilhar preview">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.8l6.8-4.6M8.6 13.2l6.8 4.6"/></svg>
          </button>
          <a class="buy-btn" href="${escapeAttr(item.produtoUrl)}" target="_blank" rel="noopener noreferrer" title="Abrir produto">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7h10l-1 9H8L7 7z"/><path d="M7 7L6 4H3"/><circle cx="9" cy="20" r="1"/><circle cx="16" cy="20" r="1"/></svg>
          </a>
        ` : ""}
        <button class="edit-btn" title="Editar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </button>
        <button class="delete-btn" title="Excluir">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z"/></svg>
        </button>
      </div>
    `;
  }

  function renderLinkPreviewCard(item){
    const preview = normalizeLinkPreview(item.linkPreview, item.produtoUrl);
    const title = item.nome || preview.title || nameFromProductUrl(item.produtoUrl);
    const description = preview.description || item.produtoUrl;
    const image = preview.image || item.imagem;
    const source = preview.publisher || nameFromProductUrl(item.produtoUrl);
    return `
      <div class="funko-card link-preview-card" data-id="${item.id}">
        <a class="card-window link-preview-window" href="${escapeAttr(item.produtoUrl)}" target="_blank" rel="noopener noreferrer">
          <div class="list-tag">Wishlist</div>
          ${image
            ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(title)}" onerror="this.style.display='none'; this.insertAdjacentHTML('afterend', '<span class=\\'link-preview-fallback\\'>${escapeAttr(source)}</span>')">`
            : `<span class="link-preview-fallback">${escapeHtml(source || "Link do produto")}</span>`
          }
        </a>
        <div class="card-body">
          <p class="card-category">${escapeHtml(source || "Marketplace")}</p>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(description)}</p>
          <div class="card-foot">
            <span class="${item.valor ? "price-tag" : "preview-tag"}">${item.valor ? currency(item.valor) : "Preview do link"}</span>
            ${renderCardActions(item)}
          </div>
        </div>
      </div>
    `;
  }

  function renderFunkoCard(item){
    return `
      <div class="funko-card" data-id="${item.id}">
        <div class="card-window">
          ${item.caixa ? `<div class="box-tag">Nº ${escapeHtml(item.caixa)}</div>` : ""}
          ${item.imagem
            ? `<img src="${escapeAttr(item.imagem)}" alt="${escapeAttr(item.nome)}" onerror="this.style.display='none'; this.insertAdjacentHTML('afterend', '<span class=\\'no-image\\'>Sem imagem</span>')">`
            : `<span class="no-image">Sem imagem</span>`
          }
        </div>
        <div class="card-body">
          ${item.categoria ? `<p class="card-category">${escapeHtml(item.categoria)}</p>` : ""}
          <h3>${escapeHtml(item.nome)}</h3>
          <div class="card-foot">
            <span class="price-tag">${currency(item.valor)}</span>
            ${renderCardActions(item)}
          </div>
        </div>
      </div>
    `;
  }

  function renderCard(item){
    if(currentList === "wishlist" && item.produtoUrl) return renderLinkPreviewCard(item);
    return renderFunkoCard(item);
  }

  function renderGaleria(){
    const isWishlist = currentList === "wishlist";
    document.getElementById("galeriaTitulo").textContent = isWishlist ? "Wishlist" : "Minha Coleção";
    document.getElementById("galeriaSubtitulo").textContent = isWishlist
      ? "Os Funkos que você ainda sonha em ter."
      : "Todos os seus Funko Pops, catalogados em um só lugar.";
    statsRow.style.display = isWishlist ? "none" : "flex";
    document.getElementById("emptyTitle").textContent = isWishlist ? "Sua wishlist está vazia" : "Sua prateleira está vazia";
    document.getElementById("emptyText").textContent = isWishlist ? "Adicione o primeiro Funko que você deseja ter." : "Adicione o primeiro Funko Pop da sua coleção.";
    document.getElementById("emptyAddBtn").textContent = isWishlist ? "+ Adicionar à wishlist" : "+ Adicionar Funko";

    const listItems = collection.filter(i => i.lista === currentList);

    // popula filtro de categorias com base na lista atual
    const categorias = [...new Set(listItems.map(i => i.categoria).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const currentFilterValue = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="">Todas as categorias</option>' +
      categorias.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join("");
    if(categorias.includes(currentFilterValue)) categoryFilter.value = currentFilterValue;

    let items = [...listItems];
    const q = searchInput.value.trim().toLowerCase();
    if(q){
      items = items.filter(i =>
        (i.nome||"").toLowerCase().includes(q) ||
        (i.caixa||"").toLowerCase().includes(q) ||
        (i.categoria||"").toLowerCase().includes(q) ||
        (i.produtoUrl||"").toLowerCase().includes(q) ||
        ((i.linkPreview && i.linkPreview.title)||"").toLowerCase().includes(q) ||
        ((i.linkPreview && i.linkPreview.description)||"").toLowerCase().includes(q)
      );
    }
    if(categoryFilter.value){
      items = items.filter(i => i.categoria === categoryFilter.value);
    }

    const sortMode = sortSelect.value;
    items.sort((a,b)=>{
      if(sortMode === "name") return (a.nome||"").localeCompare(b.nome||"");
      if(sortMode === "box") return (a.caixa||"").localeCompare(b.caixa||"", undefined, {numeric:true});
      if(sortMode === "value-desc") return (b.valor||0) - (a.valor||0);
      if(sortMode === "value-asc") return (a.valor||0) - (b.valor||0);
      return (b.criadoEm||0) - (a.criadoEm||0);
    });

    if(!isWishlist) updateStats(listItems);
    updateHomeStats();

    if(listItems.length === 0){
      gridEl.innerHTML = "";
      renderPagination(0);
      emptyState.style.display = "block";
      return;
    }
    emptyState.style.display = "none";

    if(items.length === 0){
      renderPagination(0);
      gridEl.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><span class="emoji">🔍</span><h3>Nada encontrado</h3><p>Tente buscar por outro nome, categoria ou número de caixa.</p></div>';
      return;
    }

    const totalPages = shouldPaginateGallery() ? Math.ceil(items.length / MOBILE_PAGE_SIZE) : 1;
    galleryPage = Math.min(Math.max(galleryPage, 1), Math.max(totalPages, 1));
    const visibleItems = shouldPaginateGallery()
      ? items.slice((galleryPage - 1) * MOBILE_PAGE_SIZE, galleryPage * MOBILE_PAGE_SIZE)
      : items;
    renderPagination(totalPages);

    gridEl.innerHTML = visibleItems.map(renderCard).join("");

    gridEl.querySelectorAll(".share-btn").forEach(btn=>{
      btn.addEventListener("click", (e)=>{
        const id = e.target.closest(".funko-card").dataset.id;
        shareWishlistItem(id);
      });
    });
    gridEl.querySelectorAll(".edit-btn").forEach(btn=>{
      btn.addEventListener("click", (e)=>{
        const id = e.target.closest(".funko-card").dataset.id;
        startEdit(id);
      });
    });
    gridEl.querySelectorAll(".delete-btn").forEach(btn=>{
      btn.addEventListener("click", (e)=>{
        const id = e.target.closest(".funko-card").dataset.id;
        deleteItem(id);
      });
    });
  }

  function updateStats(listItems){
    const total = listItems.length;
    const valorTotal = listItems.reduce((s,i)=> s + (Number(i.valor)||0), 0);
    const media = total ? valorTotal / total : 0;
    document.getElementById("statTotal").textContent = total;
    document.getElementById("statValor").textContent = currency(valorTotal);
    document.getElementById("statMedia").textContent = currency(media);
  }

  function updateHomeStats(){
    const colecaoItems = collection.filter(i => i.lista === "colecao");
    const wishlistItems = collection.filter(i => i.lista === "wishlist");
    const valorColecao = colecaoItems.reduce((s,i)=> s + (Number(i.valor)||0), 0);
    document.getElementById("homeCollectionCount").textContent = colecaoItems.length + (colecaoItems.length === 1 ? " item" : " itens");
    document.getElementById("homeCollectionValue").textContent = currency(valorColecao);
    document.getElementById("homeWishlistCount").textContent = wishlistItems.length + (wishlistItems.length === 1 ? " item" : " itens");
  }

  function startEdit(id){
    const item = collection.find(i => i.id === id);
    if(!item) return;
    editIdInput.value = item.id;
    productUrlInput.value = item.produtoUrl || "";
    imgUrlInput.value = item.imagem || "";
    document.getElementById("nome").value = item.nome || "";
    document.getElementById("categoria").value = item.categoria || "";
    document.getElementById("boxNumber").value = item.caixa || "";
    document.getElementById("valor").value = item.valor || "";
    updatePreview();
    setFormList(item.lista || "colecao");
    submitBtn.textContent = "Salvar alterações";
    formTitle.textContent = "Editar Funko";
    cancelEditBtn.style.display = "inline-block";
    setActiveView("adicionar");
  }

  function deleteItem(id){
    if(!confirm("Tem certeza que deseja excluir este Funko?")) return;
    collection = collection.filter(i => i.id !== id);
    saveCollection(collection);
    renderGaleria();
    showToast("Funko removido.");
  }

  /* ===================== BACKUP / RESTORE ===================== */
  document.getElementById("exportBtn").addEventListener("click", ()=>{
    const data = JSON.stringify({app:"Meu Hobby", exportadoEm:new Date().toISOString(), funkos:collection}, null, 2);
    const blob = new Blob([data], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dataStr = new Date().toISOString().slice(0,10);
    a.href = url;
    a.download = "meu-hobby-backup-" + dataStr + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Backup exportado com sucesso!");
  });

  const restoreInput = document.getElementById("restoreInput");
  document.getElementById("restoreBtn").addEventListener("click", ()=> restoreInput.click());
  restoreInput.addEventListener("change", (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(ev){
      try{
        const parsed = JSON.parse(ev.target.result);
        const funkos = Array.isArray(parsed) ? parsed : parsed.funkos;
        if(!Array.isArray(funkos)) throw new Error("Formato inválido");
        const confirmMsg = "Isso vai substituir sua coleção atual (" + collection.length + " itens) por " + funkos.length + " itens do backup. Deseja continuar?";
        if(!confirm(confirmMsg)) return;
        collection = funkos.map(f => ({
          id: f.id || crypto.randomUUID(),
          imagem: f.imagem || "",
          nome: f.nome || "Sem nome",
          categoria: f.categoria || "",
          caixa: f.caixa || "",
          valor: Number(f.valor) || 0,
          produtoUrl: f.produtoUrl || f.productUrl || "",
          linkPreview: normalizeLinkPreview(f.linkPreview, f.produtoUrl || f.productUrl || ""),
          lista: f.lista === "wishlist" ? "wishlist" : "colecao",
          criadoEm: f.criadoEm || Date.now()
        }));
        saveCollection(collection);
        showToast("Coleção restaurada com sucesso!");
        setActiveView("inicio");
      }catch(err){
        console.error(err);
        showToast("Arquivo inválido. Selecione um backup exportado pelo Meu Hobby.", true);
      }finally{
        restoreInput.value = "";
      }
    };
    reader.readAsText(file);
  });

  /* ===================== PWA: SERVICE WORKER ===================== */
  if("serviceWorker" in navigator){
    const swCode = `
      const CACHE = "meu-hobby-cache-v1";
      self.addEventListener("install", e => self.skipWaiting());
      self.addEventListener("activate", e => self.clients.claim());
      self.addEventListener("fetch", e => {
        e.respondWith(
          caches.match(e.request).then(cached => cached || fetch(e.request).catch(()=> cached))
        );
      });
    `;
    try{
      const swBlob = new Blob([swCode], {type: "application/javascript"});
      const swUrl = URL.createObjectURL(swBlob);
      navigator.serviceWorker.register(swUrl).catch(()=>{ /* navegador não suporta SW via blob */ });
    }catch(e){ /* ignora silenciosamente */ }
  }

  let deferredPrompt = null;
  const installBtn = document.getElementById("installBtn");
  window.addEventListener("beforeinstallprompt", (e)=>{
    e.preventDefault();
    deferredPrompt = e;
    installBtn.style.display = "flex";
  });
  installBtn.addEventListener("click", async ()=>{
    if(!deferredPrompt) return;
    deferredPrompt.prompt();
    const {outcome} = await deferredPrompt.userChoice;
    if(outcome === "accepted") showToast("App instalado com sucesso!");
    deferredPrompt = null;
    installBtn.style.display = "none";
  });
  window.addEventListener("appinstalled", ()=>{
    installBtn.style.display = "none";
    showToast("Meu Hobby instalado! Procure o app na sua tela inicial.");
  });
  if(window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true){
    installBtn.style.display = "none";
  }

  /* ===================== INIT ===================== */
  setFormList("colecao");
  updateHomeStats();
})();
