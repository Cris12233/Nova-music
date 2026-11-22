import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { readAudioMetadata } from "./audio-metadata.js";

const configured = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("PEGA_AQUI") && SUPABASE_ANON_KEY.length > 30 && !SUPABASE_ANON_KEY.includes("PEGA_AQUI");
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.localStorage } }) : null;
const NOVA_API_BASE = "https://nova-mega-server.onrender.com";
const $ = id => document.getElementById(id);
const audio = $("audio");
audio.preload = "auto";
// Despierta el servidor gratuito en segundo plano para reducir la espera al reproducir.
fetch(`${NOVA_API_BASE}/health`, { cache: "no-store", keepalive: true }).catch(() => {});
audio.addEventListener("ended",()=>{
 void saveListeningProgress();
 if(!playQueue.length){
  if(!tracks.length)return;

  let nextTrackIndex;

  if(shuffleQueue){
   nextTrackIndex=Math.floor(Math.random()*tracks.length);

   if(tracks.length>1 && nextTrackIndex===currentIndex){
    nextTrackIndex=(nextTrackIndex+1)%tracks.length;
   }
  }else{
   nextTrackIndex=(currentIndex+1)%tracks.length;
  }

  playTrack(nextTrackIndex);
  return;
 }

 let nextIndex=getNextQueueIndex();

 if(nextIndex>=playQueue.length){
  if(repeatQueue){
   nextIndex=0;
  }else{
   return;
  }
 }

 const song=playQueue[nextIndex];
 if(!song)return;

 const trackIndex=tracks.findIndex(t=>t.id===song.id);
 if(trackIndex!==-1)playTrack(trackIndex);
});
let tracks = [], currentIndex = -1, playlists = JSON.parse(localStorage.getItem("nova_playlists") || "[]");
let currentSession = null;
let memberApproved = false;
let downloadsAllowed = false;
let novaDeviceHeartbeat = null;
const NOVA_DEVICE_STORAGE_KEY = "nova_device_id";

function getNovaDeviceId(){
 let id=localStorage.getItem(NOVA_DEVICE_STORAGE_KEY);
 if(!id){
  if(crypto.randomUUID){
   id=crypto.randomUUID();
  }else{
   const bytes=new Uint8Array(16);
   crypto.getRandomValues(bytes);
   bytes[6]=(bytes[6]&15)|64;
   bytes[8]=(bytes[8]&63)|128;
   const hex=Array.from(bytes,value=>value.toString(16).padStart(2,"0")).join("");
   id=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  localStorage.setItem(NOVA_DEVICE_STORAGE_KEY,id);
 }
 return id;
}

async function registerNovaDevice(session){
 if(!supabase||!session)return {ok:false,message:"No se pudo verificar el dispositivo."};
 const {data,error}=await supabase.rpc("nova_register_device",{
  p_device_id:getNovaDeviceId(),
  p_device_label:(navigator.userAgent||"Dispositivo").slice(0,120)
 });
 if(error)throw new Error("No se pudo comprobar el límite de dispositivos. Inténtalo de nuevo.");
 if(!data?.ok){
  if(data?.reason==="device_limit_exceeded"){
   return {ok:false,message:"Se detectaron más de 2 dispositivos simultáneos. Tu cuenta quedó suspendida temporalmente y necesita la aprobación del administrador."};
  }
  if(data?.reason==="suspended"){
   return {ok:false,message:"Tu cuenta está suspendida. Solicita al administrador que revise tu acceso."};
  }
  return {ok:false,message:"Tu cuenta todavía no está aprobada para entrar."};
 }
 if(novaDeviceHeartbeat)clearInterval(novaDeviceHeartbeat);
 novaDeviceHeartbeat=setInterval(async()=>{
  if(!currentSession||currentSession.user.id!==session.user.id)return;
  const {data:alive,error:heartbeatError}=await supabase.rpc("nova_touch_device",{p_device_id:getNovaDeviceId()});
  if(heartbeatError||alive!==true){
   clearInterval(novaDeviceHeartbeat);
   novaDeviceHeartbeat=null;
   lockMemberArea("No se pudo renovar la sesión de este dispositivo. Vuelve a iniciar sesión.");
  }
 },60000);
 return {ok:true};
}
let adminVerified = false;
let activeTrackId = null;
let trackedPlayId = null;
let lastHistorySave = 0;
let historyEntries = [];
let artistProfiles = [];
let notificationChannel = null;
let notificationChannelUserId = null;
let pendingResumeSeconds = 0;
let sleepTimerTimeout = null;
let sleepTimerMinutes = 0;
let favoriteTracks = JSON.parse(localStorage.getItem("nova_favorites") || "[]");
let playQueue = [];
let queueIndex = -1;
let repeatQueue = false;
let shuffleQueue = false;
$("shuffleBtn").onclick=()=>{
 shuffleQueue=!shuffleQueue;
 $("shuffleBtn").style.opacity=shuffleQueue?"1":"0.5";
 toast(shuffleQueue?"Modo aleatorio activado":"Modo aleatorio desactivado");
};

$("repeatBtn").onclick=()=>{
 repeatQueue=!repeatQueue;
 $("repeatBtn").style.opacity=repeatQueue?"1":"0.5";
 toast(repeatQueue?"Repetir cola activado":"Repetir cola desactivado");
};
function getNextQueueIndex(){
 if(!playQueue.length)return -1;

 if(shuffleQueue){
   if(playQueue.length===1)return 0;
   if(queueIndex<0)return Math.floor(Math.random()*playQueue.length);
   let nextIndex=Math.floor(Math.random()*(playQueue.length-1));
   if(nextIndex>=queueIndex)nextIndex++;
   return nextIndex;
  }

 return queueIndex+1;
}
function toast(msg){$("toast").textContent=msg;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2400)}
function time(s){if(!Number.isFinite(s))return "0:00";return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`}
function openModal(id){$(id).classList.add("open")}
function closeModal(id){$(id).classList.remove("open")}
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
let adminRefreshPromise = null;
$("adminOpen").onclick=()=>{
 openModal("adminModal");
 if(adminRefreshPromise)return;
 adminRefreshPromise=refreshSession().finally(()=>{adminRefreshPromise=null;});
};
$("newPlaylist").onclick=()=>openModal("playlistModal");
function addToQueue(index){
 const song=tracks[index];
 if(!song)return;

 if(playQueue.some(t=>t.id===song.id)){
  toast("Esta canción ya está en la cola.");
  return;
 }
function renderQueue(){
 const list=$("queueList");
 const panel=$("queuePanel");

 $("queueCount").textContent=playQueue.length+" canciones";

 panel.classList.toggle("hidden",playQueue.length===0);

 if(!playQueue.length){
  list.innerHTML="";
  return;
 }

 list.innerHTML=playQueue.map((song,i)=>`
  <div class="queue-item">
   <span>${i+1}. ${escapeHtml(song.title)}</span>
   <button data-remove-queue="${i}">×</button>
  </div>
 `).join("");

 document.querySelectorAll("[data-remove-queue]").forEach(b=>{
  b.onclick=()=>{
   const removedIndex=Number(b.dataset.removeQueue);
    playQueue.splice(removedIndex,1);
    if(removedIndex<queueIndex)queueIndex--;
    else if(removedIndex===queueIndex)queueIndex=-1;
    renderQueue();
  };
 });
}
 playQueue.push(song);
 renderQueue()
 toast("Añadida a la cola: "+song.title);
}
function toggleFavorite(id){
  const exists=favoriteTracks.includes(id);

  if(exists){
    favoriteTracks=favoriteTracks.filter(x=>x!==id);
  }else{
    favoriteTracks.push(id);
  }

  localStorage.setItem("nova_favorites",JSON.stringify(favoriteTracks));
  renderTracks();
}
function renderFavorites(){
  const grid=$("favoritesGrid");
  const count=$("favoriteCount");
  if(!grid||!count)return;

  const favorites=tracks.filter(track=>favoriteTracks.includes(track.id));
  count.textContent=`${favorites.length} ${favorites.length===1?"canción":"canciones"}`;

  if(!favorites.length){
    grid.innerHTML='<p class="muted-text">Todavía no tienes canciones favoritas.</p>';
    return;
  }

  grid.innerHTML=favorites.map(track=>{
    const index=tracks.indexOf(track);
    const cover=track.cover_url?`background-image:url(\'${escapeAttr(track.cover_url)}\')`:"";
    const subtitle=[track.artist||"Artista independiente",track.album].filter(Boolean).join(" · ");
    return `<article class="track-card"><div class="cover" style="${cover}"><span class="cover-symbol" ${track.cover_url?'style="display:none"':''}>♫</span><button class="card-play" data-play="${index}">▶</button></div><div class="track-info"><b>${escapeHtml(track.title)}</b><span>${escapeHtml(subtitle)}</span><div class="track-actions"><button data-favorite="${escapeAttr(track.id)}">❤️ Quitar favorito</button><button data-play="${index}">▶ Escuchar</button>${downloadsAllowed?'<a href="#" data-download="'+escapeAttr(track.id)+'">↓ Descargar</a>':'<button type="button" class="download-locked" disabled title="El administrador todavía no ha autorizado las descargas">🔒 Descarga no autorizada</button>'}<button data-queue="${index}">＋ Cola</button>${adminVerified?`<button class="admin-delete-song" data-delete-song="${escapeAttr(track.id)}">🗑 Eliminar</button>`:""}</div></div></article>`;
  }).join("");

  grid.querySelectorAll("[data-play]").forEach(button=>button.onclick=()=>playTrack(Number(button.dataset.play)));
  grid.querySelectorAll("[data-queue]").forEach(button=>button.onclick=()=>addToQueue(Number(button.dataset.queue)));
  grid.querySelectorAll("[data-favorite]").forEach(button=>button.onclick=()=>toggleFavorite(button.dataset.favorite));
  grid.querySelectorAll("[data-delete-song]").forEach(button=>button.onclick=()=>deleteSong(button.dataset.deleteSong));
  grid.querySelectorAll("[data-download]").forEach(button=>button.onclick=event=>{event.preventDefault();downloadTrack(button.dataset.download)});
}
function renderLibraryFilters(){
 const unique=(key)=>[...new Set(tracks.map(track=>(track[key]||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"}));
 const fill=(id,values,placeholder)=>{
  const select=$(id);if(!select)return;
  const previous=select.value;
  select.innerHTML='<option value="">'+placeholder+'</option>'+values.map(value=>'<option value="'+escapeAttr(value)+'">'+escapeHtml(value)+'</option>').join("");
  select.value=values.includes(previous)?previous:"";
  if(!select.dataset.bound){select.addEventListener("change",renderTracks);select.dataset.bound="1";}
 };
 fill("artistFilter",unique("artist"),"Todos los artistas");
 fill("albumFilter",unique("album"),"Todos los álbumes");
 const sort=$("sortFilter");
 if(sort&&!sort.dataset.bound){sort.addEventListener("change",renderTracks);sort.dataset.bound="1";}
}

function renderRecommendations(){
 const grid=$("recommendGrid");if(!grid)return;
 const listened=new Set(historyEntries.map(item=>item.song_id));
 const seeds=tracks.filter(track=>favoriteTracks.includes(track.id)||listened.has(track.id));
 const artists=new Set(seeds.map(track=>(track.artist||"").trim().toLowerCase()).filter(Boolean));
 let candidates=tracks.filter(track=>!favoriteTracks.includes(track.id)&&!listened.has(track.id)&&artists.has((track.artist||"").trim().toLowerCase()));
 if(candidates.length<4)candidates=tracks.filter(track=>!favoriteTracks.includes(track.id)&&!listened.has(track.id));
 if(candidates.length<4)candidates=tracks.filter(track=>!favoriteTracks.includes(track.id));
 candidates=candidates.slice(0,8);
 if(!candidates.length){grid.innerHTML='<p class="muted-text">Ya exploraste toda la colección. Pronto habrá más descubrimientos.</p>';return;}
 grid.innerHTML=candidates.map(track=>{
  const index=tracks.indexOf(track),cover=track.cover_url?'background-image:url(\''+escapeAttr(track.cover_url)+'\')':"";
  return '<article class="track-card"><div class="cover" style="'+cover+'"><span class="cover-symbol" '+(track.cover_url?'style="display:none"':"")+' >♫</span><button class="card-play" data-recommend-play="'+index+'">▶</button></div><div class="track-info"><b>'+escapeHtml(track.title)+'</b><span>'+escapeHtml([track.artist||"Artista independiente",track.album].filter(Boolean).join(" · "))+'</span><div class="track-actions"><button data-recommend-play="'+index+'">▶ Escuchar</button><button data-recommend-favorite="'+escapeAttr(track.id)+'">♡ Favorito</button></div></div></article>';
 }).join("");
 grid.querySelectorAll("[data-recommend-play]").forEach(button=>button.onclick=()=>playTrack(Number(button.dataset.recommendPlay)));
 grid.querySelectorAll("[data-recommend-favorite]").forEach(button=>button.onclick=()=>toggleFavorite(button.dataset.recommendFavorite));
}

function artistProfileFor(name){
 return artistProfiles.find(profile=>profile.artist_name.toLowerCase()===name.toLowerCase())||null;
}
function renderArtists(){
 const grid=$("artistGrid");if(!grid)return;
 const names=[...new Set(tracks.map(track=>(track.artist||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"}));
 if(!names.length){grid.innerHTML='<p class="muted-text">Todavía no hay artistas identificados en la colección.</p>';return;}
 grid.innerHTML=names.map(name=>{
  const profile=artistProfileFor(name),count=tracks.filter(track=>(track.artist||"").trim().toLowerCase()===name.toLowerCase()).length;
  const avatar=profile?.avatar_url?'<img src="'+escapeAttr(profile.avatar_url)+'" alt="" loading="lazy">':'<span>'+escapeHtml(name.slice(0,1).toUpperCase())+'</span>';
  return '<button class="nova-artist-card" type="button" data-artist-profile="'+escapeAttr(name)+'"><span class="nova-artist-avatar">'+avatar+'</span><span class="nova-artist-meta"><b>'+escapeHtml(name)+'</b><small>'+(profile?.genre?escapeHtml(profile.genre)+' · ':'')+count+' '+(count===1?'canción':'canciones')+'</small></span><span class="nova-artist-arrow">↗</span></button>';
 }).join("");
 grid.querySelectorAll("[data-artist-profile]").forEach(button=>button.onclick=()=>openArtistProfile(button.dataset.artistProfile));
}
async function loadArtistProfiles(){
 if(!supabase||!memberApproved)return;
 const {data,error}=await supabase.from("nova_artist_profiles").select("artist_name,bio,genre,avatar_url,updated_at");
 if(error){console.warn("NOVA artist profiles:",error.message);artistProfiles=[];}
 else artistProfiles=data||[];
 renderArtists();
}
function openArtistProfile(name){
 const profile=artistProfileFor(name),songs=tracks.filter(track=>(track.artist||"").trim().toLowerCase()===name.toLowerCase());
 $("communityTitle").textContent=name;
 const content=$("communityContent");
 const avatar=profile?.avatar_url?'<img class="nova-profile-avatar" src="'+escapeAttr(profile.avatar_url)+'" alt="">':'<div class="nova-profile-avatar nova-profile-initial">'+escapeHtml(name.slice(0,1).toUpperCase())+'</div>';
 content.innerHTML='<div class="nova-artist-profile">'+avatar+'<div><h3>'+escapeHtml(name)+'</h3><p>'+escapeHtml(profile?.genre||"Artista independiente")+'</p></div></div><p class="nova-artist-bio">'+escapeHtml(profile?.bio||"Este artista forma parte de la colección de música inédita de NOVA MUSIC.")+'</p><h4>En la colección</h4><div class="nova-profile-songs">'+songs.map(track=>'<button class="nova-profile-song" data-profile-play="'+tracks.indexOf(track)+'"><span>♫ '+escapeHtml(track.title)+'</span><small>▶ Escuchar</small></button>').join("")+'</div>'+(adminVerified?'<button id="editArtistProfile" class="outline-btn">Editar perfil de artista</button>':"");
 content.querySelectorAll("[data-profile-play]").forEach(button=>button.onclick=()=>{closeModal("communityModal");playTrack(Number(button.dataset.profilePlay));});
 if(adminVerified&&$("editArtistProfile"))$("editArtistProfile").onclick=()=>editArtistProfile(name,profile||{});
 openModal("communityModal");
}
function editArtistProfile(name,profile){
 const content=$("communityContent");
 content.innerHTML='<h3>Editar perfil · '+escapeHtml(name)+'</h3><label>Biografía</label><textarea id="artistBioInput" maxlength="1200" rows="4">'+escapeHtml(profile.bio||"")+'</textarea><label>Género / estilo</label><input id="artistGenreInput" maxlength="80" value="'+escapeAttr(profile.genre||"")+'" placeholder="Ej. Corridos tumbados"><label>URL de imagen (opcional)</label><input id="artistAvatarInput" type="url" maxlength="1000" value="'+escapeAttr(profile.avatar_url||"")+'" placeholder="https://…"><button id="saveArtistProfile" class="primary-btn full">Guardar perfil</button><button id="cancelArtistProfile" class="text-btn">Cancelar</button>';
 $("cancelArtistProfile").onclick=()=>openArtistProfile(name);
 $("saveArtistProfile").onclick=async()=>{
  const payload={artist_name:name,bio:$("artistBioInput").value.trim(),genre:$("artistGenreInput").value.trim(),avatar_url:$("artistAvatarInput").value.trim()||null,updated_by:currentSession.user.id,updated_at:new Date().toISOString()};
  $("saveArtistProfile").disabled=true;
  const {error}=await supabase.from("nova_artist_profiles").upsert(payload,{onConflict:"artist_name"});
  $("saveArtistProfile").disabled=false;
  if(error)return toast("No se pudo guardar el perfil: "+error.message);
  await loadArtistProfiles();toast("Perfil de artista actualizado");openArtistProfile(name);
 };
}

function renderTracks(){
 const q=$("search").value.toLowerCase();
 const artist=$("artistFilter")?.value||"",album=$("albumFilter")?.value||"",sort=$("sortFilter")?.value||"recent";
 let shown=tracks.filter(t=>(t.title+" "+(t.artist||"")+" "+(t.album||"")).toLowerCase().includes(q)&&(!artist||t.artist===artist)&&(!album||t.album===album));
 if(sort==="oldest")shown=shown.slice().reverse();
 if(sort==="title")shown=shown.slice().sort((a,b)=>a.title.localeCompare(b.title,"es",{sensitivity:"base"}));
 if(sort==="artist")shown=shown.slice().sort((a,b)=>(a.artist||"").localeCompare(b.artist||"","es",{sensitivity:"base"}));
 $("trackCount").textContent=tracks.length;
 $("trackGrid").innerHTML=shown.length?shown.map(t=>{
  const idx=tracks.indexOf(t), cover=t.cover_url?`background-image:url('${escapeAttr(t.cover_url)}')`:"";
  const subtitle=[t.artist||"Artista independiente",t.album].filter(Boolean).join(" · ");
  

return `<article class="track-card"><div class="cover" style="${cover}"><span class="cover-symbol" ${t.cover_url?'style="display:none"':''}>♫</span><button class="card-play" data-play="${idx}">▶</button></div><div class="track-info"><b>${escapeHtml(t.title)}</b><span>${escapeHtml(subtitle)}</span><div class="track-actions"><button data-favorite="${escapeAttr(t.id)}">${favoriteTracks.includes(t.id)?"❤️":"🤍"} Favorito</button><button data-play="${idx}">▶ Escuchar</button>${downloadsAllowed?'<a href="#" data-download="'+escapeAttr(t.id)+'">↓ Descargar</a>':'<button type="button" class="download-locked" disabled title="El administrador todavía no ha autorizado las descargas">🔒 Descarga no autorizada</button>'}<button data-add="${idx}">＋ Playlist</button><button data-queue="${idx}">＋ Cola</button><button data-comments="${escapeAttr(t.id)}">💬 Comentarios</button><button data-report="${escapeAttr(t.id)}">⚑ Reportar</button>${adminVerified?`<button class="admin-delete-song" data-delete-song="${escapeAttr(t.id)}">🗑 Eliminar</button>`:""}</div></div></article>`;

  
 }).join(""):`<div class="empty-state"><div class="empty-icon">♫</div><h3>${tracks.length?"No encontramos esa canción":"Tu escenario está listo"}</h3><p>${tracks.length?"Prueba con otro nombre, artista o álbum.":"Las canciones que publiques aparecerán aquí."}</p></div>`;
 document.querySelectorAll("[data-play]").forEach(b=>b.onclick=()=>playTrack(Number(b.dataset.play)));
 document.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>addTrackToPlaylist(Number(b.dataset.add)));
 document.querySelectorAll("[data-queue]").forEach(b=>b.onclick=()=>addToQueue(Number(b.dataset.queue)));
 document.querySelectorAll("[data-favorite]").forEach(b=>{
  b.onclick=()=>toggleFavorite(b.dataset.favorite);
});
 document.querySelectorAll("[data-download]").forEach(b=>{
  b.onclick=event=>{event.preventDefault();downloadTrack(b.dataset.download)};
});
 document.querySelectorAll("[data-comments]").forEach(b=>b.onclick=()=>openSongComments(b.dataset.comments));
 document.querySelectorAll("[data-report]").forEach(b=>b.onclick=()=>openSongReport(b.dataset.report));
 document.querySelectorAll("[data-delete-song]").forEach(b=>b.onclick=()=>deleteSong(b.dataset.deleteSong));
renderFavorites();
 renderRecommendations();
 renderArtists();
}

function memberDisplayName(){return currentSession?.user?.user_metadata?.display_name||currentSession?.user?.email?.split("@")[0]||"Miembro NOVA";}
async function logSongEvent(songId,eventType){
 if(!supabase||!memberApproved||!currentSession||!songId)return;
 const {error}=await supabase.from("nova_song_events").insert({song_id:songId,user_id:currentSession.user.id,event_type:eventType});
 if(error)console.warn("NOVA event:",error.message);
}
async function saveListeningProgress(){
 if(!supabase||!memberApproved||!activeTrackId||!currentSession)return;
 const progress=Math.floor(audio.currentTime||0);if(progress<5)return;
 const {error}=await supabase.from("nova_listening_history").upsert({user_id:currentSession.user.id,song_id:activeTrackId,progress_seconds:progress,updated_at:new Date().toISOString()},{onConflict:"user_id,song_id"});
 if(error)console.warn("NOVA history:",error.message);
}
function renderHistory(){
 const grid=$("historyGrid");if(!grid)return;
 const entries=historyEntries.filter(item=>item.song);
 if(!entries.length){grid.innerHTML='<p class="muted-text">Tus canciones escuchadas aparecerán aquí.</p>';return;}
 grid.innerHTML=entries.map(item=>'<article class="community-history-item"><div><b>'+escapeHtml(item.song.title)+'</b><span>'+escapeHtml(item.song.artist||"Artista independiente")+'</span><small>Continuar desde '+time(Number(item.progress_seconds)||0)+'</small></div><button class="outline-btn" data-history-play="'+escapeAttr(item.song.id)+'" data-progress="'+Number(item.progress_seconds||0)+'">▶ Continuar</button></article>').join("");
 grid.querySelectorAll("[data-history-play]").forEach(button=>button.onclick=()=>{const index=tracks.findIndex(t=>t.id===button.dataset.historyPlay);if(index<0)return toast("Esta canción ya no está disponible.");pendingResumeSeconds=Number(button.dataset.progress)||0;playTrack(index);});
}
function renderNotifications(items){
 const list=$("notificationsList");if(!list)return;
 $("notificationCount").textContent=String(items.filter(x=>!x.read_at).length);
 if(!items.length){list.innerHTML='<p class="muted-text">Todavía no tienes notificaciones.</p>';return;}
 list.innerHTML=items.map(item=>'<article class="community-notification '+(item.read_at?"read":"unread")+'"><div><b>'+escapeHtml(item.title)+'</b><p>'+escapeHtml(item.body||"Hay novedades en NOVA MUSIC.")+'</p><small>'+new Date(item.created_at).toLocaleString("es-MX")+'</small></div>'+(item.read_at?'':'<button class="text-btn" data-notification-read="'+escapeAttr(item.id)+'">Marcar leída</button>')+'</article>').join("");
 list.querySelectorAll("[data-notification-read]").forEach(button=>button.onclick=async()=>{const {error}=await supabase.from("nova_notifications").update({read_at:new Date().toISOString()}).eq("id",button.dataset.notificationRead).eq("user_id",currentSession.user.id);if(error)return toast("No se pudo actualizar la notificación.");void loadCommunityData();});
}
function ensureNotificationRealtime(){
 if(!supabase||!currentSession||!memberApproved)return;
 const userId=currentSession.user.id;
 if(notificationChannelUserId===userId&&notificationChannel)return;
 if(notificationChannel)supabase.removeChannel(notificationChannel);
 notificationChannelUserId=userId;
 notificationChannel=supabase.channel("nova-notifications-"+userId)
  .on("postgres_changes",{event:"INSERT",schema:"public",table:"nova_notifications",filter:"user_id=eq."+userId},payload=>{
   const item=payload.new;
   if(item?.title)toast("Nueva notificación: "+item.title);
   void loadCommunityData();
  }).subscribe();
}

async function loadCommunityData(){
 if(!supabase||!memberApproved||!currentSession)return;
 ensureNotificationRealtime();
 const [h,n]=await Promise.all([
  supabase.from("nova_listening_history").select("song_id,progress_seconds,updated_at,song:songs(id,title,artist,album,cover_url)").order("updated_at",{ascending:false}).limit(12),
  supabase.from("nova_notifications").select("id,title,body,created_at,read_at,song_id").order("created_at",{ascending:false}).limit(30)
 ]);
 if(h.error)console.warn("NOVA history:",h.error.message);else{historyEntries=h.data||[];renderHistory();renderRecommendations();}
 if(n.error)console.warn("NOVA notifications:",n.error.message);else renderNotifications(n.data||[]);
}
async function toggleCommentLike(commentId,liked,songId){
 if(!currentSession||!memberApproved)return;
 const request=liked
  ? supabase.from("nova_comment_likes").delete().eq("comment_id",commentId).eq("user_id",currentSession.user.id)
  : supabase.from("nova_comment_likes").insert({comment_id:commentId,user_id:currentSession.user.id});
 const {error}=await request;
 if(error)return toast("No se pudo actualizar el me gusta: "+error.message);
 await openSongComments(songId);
}
async function openSongComments(songId){
 if(!memberApproved)return;
 const song=tracks.find(t=>t.id===songId);if(!song)return;
 const content=$("communityContent");$("communityTitle").textContent="Comentarios · "+song.title;
 content.innerHTML='<p class="muted-text">Cargando comentarios…</p>';openModal("communityModal");
 const {data,error}=await supabase.from("nova_song_comments").select("id,display_name,body,created_at").eq("song_id",songId).order("created_at",{ascending:true}).limit(100);
 if(error){content.innerHTML='<p class="message">'+escapeHtml(error.message)+'</p>';return;}
 const rows=data||[];
 let likes=[];
 if(rows.length){
  const result=await supabase.from("nova_comment_likes").select("comment_id,user_id").in("comment_id",rows.map(row=>row.id));
  if(!result.error)likes=result.data||[];
  else console.warn("NOVA comment likes:",result.error.message);
 }
 content.innerHTML='<div class="community-comment-list">'+(rows.length?rows.map(row=>{
  const rowLikes=likes.filter(like=>like.comment_id===row.id),liked=rowLikes.some(like=>like.user_id===currentSession.user.id);
  return '<article class="community-comment"><b>'+escapeHtml(row.display_name||"Miembro")+'</b><p>'+escapeHtml(row.body)+'</p><small>'+new Date(row.created_at).toLocaleString("es-MX")+'</small><button class="nova-comment-like '+(liked?'liked':'')+'" type="button" data-comment-like="'+escapeAttr(row.id)+'" data-liked="'+(liked?'1':'0')+'">'+(liked?'♥':'♡')+' '+rowLikes.length+'</button></article>';
 }).join(""):'<p class="muted-text">Sé el primero en comentar esta canción.</p>')+'</div><label for="communityCommentInput">Escribe un comentario</label><textarea id="communityCommentInput" maxlength="1000" rows="3" placeholder="Comparte tu opinión…"></textarea><button id="communityCommentSend" class="primary-btn full">Publicar comentario</button>';
 content.querySelectorAll("[data-comment-like]").forEach(button=>button.onclick=()=>toggleCommentLike(button.dataset.commentLike,button.dataset.liked==="1",songId));
 $("communityCommentSend").onclick=async()=>{const body=$("communityCommentInput").value.trim();if(!body)return toast("Escribe un comentario primero.");$("communityCommentSend").disabled=true;const {error:insertError}=await supabase.from("nova_song_comments").insert({song_id:songId,user_id:currentSession.user.id,display_name:memberDisplayName(),body});$("communityCommentSend").disabled=false;if(insertError)return toast(insertError.message||"No se pudo publicar.");toast("Comentario publicado");await openSongComments(songId);};
}
async function openSongReport(songId){
 if(!memberApproved)return;
 const song=tracks.find(t=>t.id===songId);if(!song)return;
 $("communityTitle").textContent="Reportar · "+song.title;
 const content=$("communityContent");
 content.innerHTML='<label for="reportReason">Motivo del reporte</label><select id="reportReason"><option value="audio">No se reproduce el audio</option><option value="metadata">Información incorrecta</option><option value="cover">Portada incorrecta</option><option value="content">Contenido inapropiado</option><option value="other">Otro problema</option></select><label for="reportDetails">Detalles (opcional)</label><textarea id="reportDetails" maxlength="1000" rows="3" placeholder="Cuéntanos qué sucede…"></textarea><button id="sendSongReport" class="primary-btn full">Enviar reporte</button>';
 openModal("communityModal");
 $("sendSongReport").onclick=async()=>{const reason=$("reportReason").value;const details=$("reportDetails").value.trim();$("sendSongReport").disabled=true;const {error}=await supabase.from("nova_song_reports").insert({song_id:songId,user_id:currentSession.user.id,reporter_name:memberDisplayName(),reason,details:details||null});$("sendSongReport").disabled=false;if(error)return toast(error.message||"No se pudo enviar el reporte.");closeModal("communityModal");toast("Reporte enviado. Gracias por avisarnos.");};
}
async function loadAdminLoginHistory(session=currentSession){
 const list=$("adminLoginHistoryList");if(!list||!session)return;
 list.innerHTML='<p class="muted-text">Cargando accesos…</p>';
 try{
  const response=await fetch("https://nova-mega-server.onrender.com/admin/login-history",{headers:{Authorization:"Bearer "+session.access_token}});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||"No se pudo consultar el historial.");
  const entries=result.entries||[],since=Date.now()-24*60*60*1000,deviceCounts={};
  entries.filter(entry=>new Date(entry.created_at).getTime()>=since).forEach(entry=>{
   deviceCounts[entry.user_id]??=new Set();deviceCounts[entry.user_id].add(entry.device_id);
  });
  list.innerHTML=entries.length?entries.map(entry=>{
   const count=deviceCounts[entry.user_id]?.size||0;
   const warning=count>2?'<em>Más de 2 dispositivos en 24 h</em>':"";
   return '<article class="nova-login-event"><div><b>'+escapeHtml(entry.user_email||"Cuenta de miembro")+'</b><span>'+escapeHtml(entry.device_label||"Dispositivo")+'</span>'+warning+'</div><small>'+new Date(entry.created_at).toLocaleString("es-MX")+'</small></article>';
  }).join(""):'<p class="muted-text">Todavía no hay inicios de sesión registrados.</p>';
 }catch(error){list.innerHTML='<p class="muted-text">'+escapeHtml(error.message)+'</p>';}
}
$("refreshAdminLoginHistory")?.addEventListener("click",()=>void loadAdminLoginHistory());

async function loadAdminAudit(session=currentSession){
 const list=$("adminAuditList");if(!list||!session)return;
 list.innerHTML='<p class="muted-text">Cargando actividad…</p>';
 try{
  const response=await fetch("https://nova-mega-server.onrender.com/admin/audit-log",{headers:{Authorization:"Bearer "+session.access_token}});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||"No se pudo consultar la bitácora.");
  const entries=result.entries||[];
  list.innerHTML=entries.length?entries.map(entry=>{
   const details=entry.details||{},label={member_access_updated:"Acceso de miembro actualizado",song_deleted:"Canción enviada a la papelera",audio_uploaded_to_mega:"Archivo subido a MEGA"}[entry.action]||entry.action;
   const target=details.title||details.name||entry.target_id||"—";
   return '<article class="nova-audit-row"><div><b>'+escapeHtml(label)+'</b><span>'+escapeHtml(String(target))+'</span></div><small>'+new Date(entry.created_at).toLocaleString("es-MX")+'</small></article>';
  }).join(""):'<p class="muted-text">Todavía no hay acciones registradas.</p>';
 }catch(error){list.innerHTML='<p class="muted-text">'+escapeHtml(error.message)+'</p>';}
}
$("refreshAdminAudit")?.addEventListener("click",()=>void loadAdminAudit());

async function loadAdminInsights(session=currentSession){
 if(!supabase||!session||!$("adminInsights"))return;
 const stats=$("adminStats"),reports=$("adminReportsList");stats.textContent="Cargando estadísticas…";reports.innerHTML='<p class="muted-text">Cargando reportes…</p>';
 const [e,r]=await Promise.all([
  supabase.from("nova_song_events").select("event_type,song_id,user_id,created_at,song:songs(title,artist)").order("created_at",{ascending:false}).limit(5000),
  supabase.from("nova_song_reports").select("id,song_id,reporter_name,reason,details,status,created_at,song:songs(title,artist)").order("created_at",{ascending:false}).limit(100)
 ]);
 if(e.error)stats.textContent="No se pudieron cargar las estadísticas: "+e.error.message;
 else{
  const events=e.data||[],plays=events.filter(x=>x.event_type==="play").length,downloads=events.filter(x=>x.event_type==="download").length,topMap={};
  events.filter(x=>x.event_type==="play").forEach(x=>{if(!topMap[x.song_id])topMap[x.song_id]={count:0,title:x.song?.title||"Canción"};topMap[x.song_id].count++;});
  const top=Object.values(topMap).sort((x,y)=>y.count-x.count).slice(0,5);
  const activeSince=Date.now()-30*24*60*60*1000;
  const activeMembers=new Set(events.filter(x=>x.user_id&&new Date(x.created_at).getTime()>=activeSince).map(x=>x.user_id)).size;
  const days=Array.from({length:7},(_,i)=>{
   const date=new Date();date.setHours(0,0,0,0);date.setDate(date.getDate()-(6-i));
   const key=date.toISOString().slice(0,10);
   return {key,label:date.toLocaleDateString("es-MX",{weekday:"short"}),count:events.filter(x=>x.event_type==="play"&&String(x.created_at||"").slice(0,10)===key).length};
  });
  const max=Math.max(1,...days.map(day=>day.count));
  stats.innerHTML='<div class="community-stat-grid"><div><b>'+plays+'</b><span>Reproducciones</span></div><div><b>'+downloads+'</b><span>Descargas</span></div><div><b>'+activeMembers+'</b><span>Miembros activos · muestra 30 días</span></div></div><h4>Reproducciones por día</h4><div class="nova-analytics-chart">'+days.map(day=>'<div class="nova-analytics-day"><span>'+day.count+'</span><div><i style="height:'+Math.max(4,Math.round(day.count/max*100))+'%"></i></div><small>'+escapeHtml(day.label)+'</small></div>').join("")+'</div><h4>Más escuchadas</h4>'+(top.length?top.map((x,i)=>'<p class="community-top-song"><b>'+(i+1)+'. '+escapeHtml(x.title)+'</b><span>'+x.count+' reproducciones</span></p>').join(""):'<p class="muted-text">Aún no hay reproducciones registradas.</p>')+'<small>Datos de hasta 5,000 eventos recientes; las cifras son una muestra, no un conteo histórico ilimitado.</small>';
 }
 if(r.error)reports.innerHTML='<p class="message">'+escapeHtml(r.error.message)+'</p>';
 else{
  const rows=r.data||[];
  reports.innerHTML=rows.length?rows.map(x=>'<article class="community-report"><div><b>'+escapeHtml(x.song?.title||"Canción")+'</b><span>'+escapeHtml(x.reporter_name||"Miembro")+' · '+escapeHtml(x.reason)+'</span><p>'+escapeHtml(x.details||"Sin detalles adicionales")+'</p><small>'+(x.status==="resolved"?"Resuelto":"Pendiente")+' · '+new Date(x.created_at).toLocaleString("es-MX")+'</small></div>'+(x.status==="resolved"?'':'<button class="outline-btn" data-report-resolve="'+escapeAttr(x.id)+'">Resolver</button>')+'</article>').join(""):'<p class="muted-text">No hay reportes todavía.</p>';
  reports.querySelectorAll("[data-report-resolve]").forEach(button=>button.onclick=async()=>{const {error}=await supabase.from("nova_song_reports").update({status:"resolved",resolved_at:new Date().toISOString()}).eq("id",button.dataset.reportResolve);if(error)return toast("No se pudo actualizar el reporte.");void loadAdminInsights(session);
  void loadAdminAudit(session);
  void loadAdminLoginHistory(session);});
 }
}
$("refreshAdminInsights")?.addEventListener("click",()=>loadAdminInsights());

function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function escapeAttr(s=""){return escapeHtml(s)}
function memberAudioUrl(endpoint,id,ticket){
 return `https://nova-mega-server.onrender.com/${endpoint}?id=${encodeURIComponent(id)}&ticket=${encodeURIComponent(ticket)}`;
}
async function requestPlaybackTicket(){
 if(!currentSession?.access_token)throw new Error("Inicia sesión para reproducir o descargar.");
 const response=await fetch("https://nova-mega-server.onrender.com/playback-ticket",{
  method:"POST",
  headers:{Authorization:`Bearer ${currentSession.access_token}`}
 });
 const result=await response.json();
 if(!response.ok||!result.ticket)throw new Error(result.error||"No se pudo autorizar la reproducción.");
 return result.ticket;
}
async function downloadTrack(id){
 if(!memberApproved)return;
 if(!downloadsAllowed)return toast("Tu cuenta todavía no tiene permiso para descargar.");
 try{
  await logSongEvent(id,"download");
  const ticket=await requestPlaybackTicket();
  window.location.assign(memberAudioUrl("download",id,ticket));
 }catch(error){
  toast(error.message||"No se pudo iniciar la descarga.");
 }
}
function playTrack(i){
 if(!tracks[i])return;

 currentIndex=i;
 const t=tracks[i];
 activeTrackId=t.id;
 trackedPlayId=null;
 lastHistorySave=0;

 const queuePosition=playQueue.findIndex(song=>song.id===t.id);
queueIndex=queuePosition;

 requestPlaybackTicket().then(ticket=>{
  if(currentIndex!==i||!memberApproved)return;
  audio.src=memberAudioUrl("stream",t.id,ticket);
  return audio.play();
 }).catch(error=>toast(error.message||"No se pudo reproducir el audio."));

 $("nowTitle").textContent=t.title;
 $("nowArtist").textContent=t.artist||"Artista independiente";
 $("nowCover").textContent="♫";
 $("nowCover").style.backgroundImage=t.cover_url?`url("${t.cover_url}")`:"";
 $("playBtn").textContent="Ⅱ";
$("playBtn").onclick=()=>{if(!audio.src){if(tracks.length)playTrack(0);return}if(audio.paused){audio.play();$("playBtn").textContent="Ⅱ"}else{audio.pause();$("playBtn").textContent="▶"}};
$("nextBtn").onclick=()=>{
  if(playQueue.length){
   let nextIndex=getNextQueueIndex();

   if(nextIndex>=playQueue.length){
    if(repeatQueue)nextIndex=0;
    else return;
   }

   const song=playQueue[nextIndex];
   if(!song)return;
   const trackIndex=tracks.findIndex(t=>t.id===song.id);
   if(trackIndex!==-1)playTrack(trackIndex);
   return;
  }

  if(tracks.length){
   playTrack((currentIndex+1)%tracks.length);
  }
};

$("prevBtn").onclick=()=>{
 if(playQueue.length&&queueIndex!==-1){
  const prevIndex=queueIndex>0?queueIndex-1:playQueue.length-1;
  const song=playQueue[prevIndex];
  const trackIndex=tracks.findIndex(t=>t.id===song.id);

  if(trackIndex!==-1)playTrack(trackIndex);
  return;
 }

 if(tracks.length){
  playTrack((currentIndex-1+tracks.length)%tracks.length);
 }
};
}
audio.ontimeupdate=()=>{
 $("seek").value=audio.duration?audio.currentTime/audio.duration*100:0;
 $("currentTime").textContent=time(audio.currentTime);
 $("duration").textContent=time(audio.duration);
 const now=Date.now();
 if(memberApproved&&activeTrackId&&audio.currentTime>=5&&now-lastHistorySave>15000){lastHistorySave=now;void saveListeningProgress();}
};
audio.addEventListener("playing",()=>{
 if(!memberApproved||!activeTrackId||trackedPlayId===activeTrackId)return;
 trackedPlayId=activeTrackId;
 void logSongEvent(activeTrackId,"play");
 if(pendingResumeSeconds>0){const resume=pendingResumeSeconds;pendingResumeSeconds=0;audio.currentTime=Math.min(resume,Math.max(0,(audio.duration||resume)-2));}
});
$("seek").oninput=()=>{if(audio.duration)audio.currentTime=Number($("seek").value)/100*audio.duration};
$("volume").oninput=()=>audio.volume=Number($("volume").value);
audio.onended=null;
$("search").oninput=renderTracks;

async function deleteSong(songId){
 if(!adminVerified||!currentSession)return toast("Solo el administrador puede eliminar canciones.");
 const song=tracks.find(track=>track.id===songId);
 if(!song)return;
 if(!window.confirm(`¿Eliminar “${song.title}” de NOVA MUSIC? Su archivo se enviará a la papelera de MEGA y se quitará de la biblioteca.`))return;
 try{
  const response=await fetch(`https://nova-mega-server.onrender.com/admin/songs/${encodeURIComponent(songId)}`,{
   method:"DELETE",
   headers:{Authorization:`Bearer ${currentSession.access_token}`}
  });
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||"No se pudo eliminar la canción.");
  tracks=tracks.filter(track=>track.id!==songId);
  playQueue=playQueue.filter(track=>track.id!==songId);
  favoriteTracks=favoriteTracks.filter(id=>id!==songId);
  localStorage.setItem("nova_favorites",JSON.stringify(favoriteTracks));
  if(activeTrackId===songId){
   audio.pause();audio.removeAttribute("src");audio.load();
   activeTrackId=null;trackedPlayId=null;currentIndex=-1;
   $("nowTitle").textContent="Selecciona una canción";
   $("nowArtist").textContent="NOVA MUSIC";
  }else{currentIndex=tracks.findIndex(track=>track.id===tracks[currentIndex]?.id);}
  renderTracks();
  renderQueue();
  void loadAdminInsights();
  toast("Canción eliminada correctamente.");
 }catch(error){toast(error.message||"No se pudo eliminar la canción.");}
}

async function loadTracks(){
 if(!memberApproved)return;
 if(!supabase){$("trackGrid").innerHTML='<div class="empty-state"><div class="empty-icon">⚙</div><h3>Falta conectar Supabase</h3><p>Abre README.txt y sigue los pasos para activar tu biblioteca musical.</p></div>';return}
 const {data,error}=await supabase.from("songs").select("id,title,artist,album,cover_url").order("created_at",{ascending:false});
 if(error){$("trackGrid").innerHTML=`<div class="empty-state"><h3>No se pudo cargar la biblioteca</h3><p>${escapeHtml(error.message)}</p></div>`;return}
 tracks=data||[];renderLibraryFilters();renderTracks();void loadArtistProfiles();
 void loadCommunityData();
}

async function refreshSession(){
 if(!supabase){
  $("adminMessage").textContent="Primero configura Supabase. Revisa README.txt.";
  showSession(null);
  return;
 }
 $("adminMessage").textContent="Restaurando tu sesión…";
 const {data,error}=await supabase.auth.getSession();
 if(error){
  showSession(null);
  $("adminMessage").textContent="No se pudo restaurar la sesión. Inicia sesión nuevamente.";
  return;
 }
 if(data.session){
  currentSession=data.session;
  $("authForm").classList.add("hidden");
  $("uploadPanel").classList.add("hidden");
  await checkMegaStatus(data.session);
 }else{
  showSession(null);
  $("adminMessage").textContent="Inicia sesión con tu cuenta de administrador para publicar música.";
 }
}

function showSession(session){
 currentSession=session||null;
 if(!session)adminVerified=false;

 // Una sesión válida no debe ocultar el panel de subida.
 // Supabase puede emitir TOKEN_REFRESHED mientras el administrador trabaja.
 if(session){
  $("signedEmail").textContent=session.user.email||"Cuenta conectada";
  return;
 }

 // Solo al cerrar sesión o perderla mostramos el formulario de acceso.
 $("authForm").classList.remove("hidden");
 $("uploadPanel").classList.add("hidden");
}

async function checkMegaStatus(session){
 $("adminMessage").textContent="Comprobando permisos de administrador…";
 try{
  const response=await fetch("https://nova-mega-server.onrender.com/mega-status",{
   headers:{Authorization:`Bearer ${session.access_token}`}
  });
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||"Esta cuenta no es administradora");
  adminVerified=true;
  $("authForm").classList.add("hidden");
  $("uploadPanel").classList.remove("hidden");
  $("adminMessage").textContent="¡MEGA conectado correctamente!";
  // La biblioteca puede haberse renderizado antes de confirmar al administrador.
  // Volvemos a dibujarla para mostrar las acciones exclusivas del administrador.
  if(memberApproved)renderTracks();
  void refreshMembers(session);
  void loadAdminInsights(session);
  return true;
 }catch(error){
  adminVerified=false;
  $("uploadPanel").classList.add("hidden");
  $("authForm").classList.remove("hidden");
  $("adminMessage").textContent=error.message;
  return false;
 }
}

function lockMemberArea(message){
 if(novaDeviceHeartbeat){clearInterval(novaDeviceHeartbeat);novaDeviceHeartbeat=null;}
 memberApproved=false;
 downloadsAllowed=false;
 if(notificationChannel){supabase?.removeChannel(notificationChannel);notificationChannel=null;notificationChannelUserId=null;}
 document.body.classList.add("access-locked");
 $("memberGate").classList.remove("hidden");
 tracks=[];
 currentIndex=-1;
 audio.pause();
 audio.removeAttribute("src");
 audio.load();
 $("trackGrid").innerHTML='<div class="empty-state"><h3>Biblioteca privada</h3><p>Inicia sesión con una cuenta aprobada para descubrir la música.</p></div>';
 $("memberGateMessage").textContent=message||"Tu acceso será habilitado cuando el administrador apruebe tu solicitud.";
 $("memberRefreshBtn").classList.toggle("hidden",!currentSession);
 $("memberLogoutBtn").classList.toggle("hidden",!currentSession);
}

async function checkMemberAccess(session){
 currentSession=session||null;
 if(!session){
  lockMemberArea("Inicia sesión o solicita acceso para entrar a NOVA MUSIC.");
  return false;
 }
 $("memberGateMessage").textContent="Verificando tu dispositivo y tu acceso…";
 try{
  const deviceCheck=await registerNovaDevice(session);
  if(!deviceCheck.ok)throw new Error(deviceCheck.message);
  const response=await fetch("https://nova-mega-server.onrender.com/member-status",{
   headers:{Authorization:`Bearer ${session.access_token}`}
  });
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||"Tu cuenta está pendiente de aprobación.");
  memberApproved=true;
  downloadsAllowed=Boolean(result.downloads_allowed||result.admin);
  const loginLogKey="nova_login_logged_"+session.user.id;
  if(!sessionStorage.getItem(loginLogKey)){
   fetch("https://nova-mega-server.onrender.com/member-login-event",{
    method:"POST",
    headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},
    body:JSON.stringify({device_id:getNovaDeviceId(),device_label:(navigator.userAgent||"Dispositivo").slice(0,120)})
   }).then(response=>{if(response.ok)sessionStorage.setItem(loginLogKey,"1");}).catch(error=>console.warn("NOVA login history:",error.message));
  }
  document.body.classList.remove("access-locked");
  $("memberGate").classList.add("hidden");
  await loadTracks();
  return true;
 }catch(error){
  lockMemberArea(error.message);
  return false;
 }
}

let memberDirectory = [];
let memberFilter = "pending";

function renderMemberDirectory(){
 const list=$("memberRequestsList");
 const counts={pending:0,approved:0,rejected:0,suspended:0};
 memberDirectory.forEach(member=>{if(counts[member.status]!==undefined)counts[member.status]++;});
 const filters=[
  ["pending","Pendientes"],["approved","Aprobados"],
  ["rejected","Rechazados"],["suspended","Suspendidos"]
 ];
 const tabs=$("memberStatusFilters");
 if(tabs){
  tabs.innerHTML=filters.map(([status,label])=>`<button type="button" class="member-filter ${memberFilter===status?"active":""}" data-member-filter="${status}"><span>${label}</span><b>${counts[status]}</b></button>`).join("");
  tabs.querySelectorAll("[data-member-filter]").forEach(button=>{
   button.onclick=()=>{memberFilter=button.dataset.memberFilter;renderMemberDirectory();};
  });
 }
 const visible=memberDirectory.filter(member=>member.status===memberFilter);
 if(!visible.length){
  list.innerHTML=`<div class="member-empty"><b>No hay usuarios ${({pending:"pendientes",approved:"aprobados",rejected:"rechazados",suspended:"suspendidos"})[memberFilter]}.</b><span>Cuando haya cuentas en esta categoría aparecerán aquí.</span></div>`;
  return;
 }
 list.innerHTML=visible.map(member=>{
  const name=escapeHtml(member.display_name||"Sin nombre");
  const email=escapeHtml(member.email||"");
  const status=member.status;
  const statusLabel={pending:"Pendiente",approved:"Aprobado",rejected:"Rechazado",suspended:"Suspendido"}[status]||status;
  const securityNote=member.suspension_reason==="device_limit_exceeded"?"Bloqueo automático: se detectaron más de 2 dispositivos.": "";
  const actions=status==="pending"
   ? '<button data-status="approved" class="member-approve">Aprobar</button><button data-status="rejected" class="member-reject">Rechazar</button>'
   : status==="approved"
     ? '<button data-status="suspended" class="member-suspend">Suspender</button>'
     : '<button data-status="approved" class="member-approve">Dar acceso</button>';
  const devicesButton=(status==="approved"||status==="suspended")?' <button data-member-devices="1" class="member-suspend">Ver dispositivos</button>':"";
  const downloadAction=status==="approved"
   ? `<div class="member-download-access"><small>Descargas: <b>${member.download_enabled===true?"Permitidas":"Bloqueadas"}</b></small><button type="button" class="member-suspend" data-download-permission="${member.download_enabled===true?"false":"true"}">${member.download_enabled===true?"Retirar permiso":"Permitir descargas"}</button></div>`
   : "";
  return `<div class="member-request-row"><div class="member-request-info"><b>${name}</b><span>${email}</span><small class="member-state state-${status}">${statusLabel}</small>${securityNote?`<small>${securityNote}</small>`:""}<div class="member-device-details" data-device-details></div></div><div class="member-request-actions" data-user-id="${escapeAttr(member.user_id)}">${actions}${devicesButton}${downloadAction}</div></div>`;
 }).join("");
 list.querySelectorAll(".member-request-actions button[data-status]").forEach(button=>{
  button.onclick=()=>updateMemberStatus(button.parentElement.dataset.userId,button.dataset.status);
 });
 list.querySelectorAll("[data-member-devices]").forEach(button=>{
  button.onclick=()=>loadMemberDevices(button.parentElement.dataset.userId,button.closest(".member-request-row").querySelector("[data-device-details]"));
 });
 list.querySelectorAll("[data-download-permission]").forEach(button=>{
  button.onclick=()=>updateMemberDownloadPermission(button.parentElement.parentElement.dataset.userId,button.dataset.downloadPermission==="true");
 });
}

async function updateMemberDownloadPermission(userId,allowed){
 const session=currentSession;
 if(!session)return;
 try{
  const response=await fetch(`https://nova-mega-server.onrender.com/admin/members/${encodeURIComponent(userId)}/download-permission`,{
   method:"PATCH",
   headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},
   body:JSON.stringify({allowed})
  });
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||"No se pudo actualizar el permiso");
  toast(allowed?"Permiso de descarga concedido":"Permiso de descarga retirado");
  await refreshMembers(session);
 }catch(error){
  toast(error.message);
 }
}

async function refreshMembers(session=currentSession){
 const panel=$("memberRequests");
 const list=$("memberRequestsList");
 if(!panel||!session)return;
 panel.classList.remove("hidden");
 list.innerHTML='<p class="muted-text">Cargando usuarios…</p>';
 try{
  const response=await fetch("https://nova-mega-server.onrender.com/admin/members",{
   headers:{Authorization:`Bearer ${session.access_token}`}
  });
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||"No se pudieron cargar los usuarios");
  memberDirectory=result.members||[];
  renderMemberDirectory();
 }catch(error){
  list.innerHTML=`<p class="message">${escapeHtml(error.message)}</p>`;
 }
}

async function loadMemberDevices(userId,target){
 if(!currentSession||!target)return;
 target.textContent="Consultando dispositivos…";
 try{
  const response=await fetch(`https://nova-mega-server.onrender.com/admin/members/${encodeURIComponent(userId)}/devices`,{
   headers:{Authorization:`Bearer ${currentSession.access_token}`}
  });
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||"No se pudieron consultar los dispositivos");
  const devices=result.devices||[];
  target.innerHTML=devices.length?devices.map(device=>{
   const label=escapeHtml(device.device_label||"Dispositivo sin identificar");
   const lastSeen=new Date(device.last_seen).toLocaleString("es-MX");
   const active=!device.revoked_at;
   return '<div class="nova-device-row"><small>'+label+' · Última actividad: '+escapeHtml(lastSeen)+(active?'':' · Revocado')+'</small>'+(active?'<button type="button" class="nova-revoke-device" data-revoke-device="'+escapeAttr(device.device_id)+'">Revocar</button>':'')+'</div>';
  }).join(""):"<small>No hay dispositivos registrados.</small>";
  target.querySelectorAll("[data-revoke-device]").forEach(button=>button.onclick=async()=>{
   if(!confirm("¿Revocar este dispositivo? Se cerrará el acceso en él cuando renueve su sesión."))return;
   button.disabled=true;
   try{
    const revoke=await fetch(`https://nova-mega-server.onrender.com/admin/members/${encodeURIComponent(userId)}/devices/${encodeURIComponent(button.dataset.revokeDevice)}/revoke`,{
     method:"POST",headers:{Authorization:`Bearer ${currentSession.access_token}`}
    });
    const result=await revoke.json();
    if(!revoke.ok)throw new Error(result.error||"No se pudo revocar el dispositivo");
    toast("Dispositivo revocado");await loadMemberDevices(userId,target);
   }catch(error){button.disabled=false;toast(error.message);}
  });
 }catch(error){target.textContent=error.message;}
}

async function updateMemberStatus(userId,status){
 const session=currentSession;
 if(!session)return;
 try{
  const response=await fetch(`https://nova-mega-server.onrender.com/admin/members/${encodeURIComponent(userId)}`,{
   method:"PATCH",
   headers:{
    Authorization:`Bearer ${session.access_token}`,
    "Content-Type":"application/json"
   },
   body:JSON.stringify({status})
  });
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||"No se pudo actualizar el acceso");
  toast(status==="approved"?"Cuenta aprobada":status==="rejected"?"Solicitud rechazada":status==="suspended"?"Cuenta suspendida":"Estado actualizado");
  await refreshMembers(session);
 }catch(error){
  toast(error.message);
 }
}

$("refreshMembersBtn").onclick=()=>refreshMembers();

$("memberLoginBtn").onclick=async()=>{
 if(!supabase)return $("memberGateMessage").textContent="Supabase no está configurado.";
 $("memberGateMessage").textContent="Iniciando sesión…";
 const {data,error}=await supabase.auth.signInWithPassword({
  email:$("memberLoginEmail").value.trim(),
  password:$("memberLoginPassword").value
 });
 if(error){$("memberGateMessage").textContent=error.message;return}
 await checkMemberAccess(data.session);
};

$("memberRefreshBtn").onclick=async()=>{
 if(currentSession)await checkMemberAccess(currentSession);
};
$("memberLogoutBtn").onclick=async()=>{
 if(currentSession?.user?.id)sessionStorage.removeItem("nova_login_logged_"+currentSession.user.id);
 if(supabase)await supabase.auth.signOut();
 showSession(null);
 lockMemberArea("Sesión cerrada. Inicia sesión o solicita acceso para entrar.");
};

$("memberRegisterBtn").onclick=async()=>{
 if(!supabase)return $("memberGateMessage").textContent="Supabase no está configurado.";
 const displayName=$("memberName").value.trim();
 const email=$("memberEmail").value.trim();
 const password=$("memberPassword").value;
 if(!displayName||!email||password.length<6){
  $("memberGateMessage").textContent="Escribe tu nombre, un correo válido y una contraseña de al menos 6 caracteres.";
  return;
 }
 $("memberRegisterBtn").disabled=true;
 $("memberGateMessage").textContent="Enviando tu solicitud…";
 const {data,error}=await supabase.auth.signUp({
  email,password,options:{data:{display_name:displayName}}
 });
 $("memberRegisterBtn").disabled=false;
 if(error){$("memberGateMessage").textContent=error.message;return}
 if(data.session){
  currentSession=data.session;
  lockMemberArea("¡Solicitud enviada! Tu cuenta quedó pendiente de aprobación. Te avisaremos cuando puedas entrar.");
 }else{
  $("memberGateMessage").textContent="¡Solicitud creada! Revisa tu correo si Supabase te pide confirmar la dirección. Después podrás iniciar sesión; el acceso seguirá pendiente hasta que el administrador te apruebe.";
 }
};

$("loginBtn").onclick=async()=>{
 if(!supabase){
  $("adminMessage").textContent="Configura Supabase primero (README.txt).";
  return;
 }
 $("adminMessage").textContent="Verificando…";
 const {data,error}=await supabase.auth.signInWithPassword({
  email:$("email").value,
  password:$("password").value
 });
 if(error){$("adminMessage").textContent=error.message;return}
 showSession(data.session);
 const isAdmin=await checkMegaStatus(data.session);
 if(!isAdmin){
  $("adminMessage").textContent="Esta cuenta no tiene permisos de administrador. Usa el acceso de miembro.";
 }
};

$("logoutBtn").onclick=async()=>{
 if(supabase)await supabase.auth.signOut();
 showSession(null);
 lockMemberArea("Sesión cerrada. Inicia sesión o solicita acceso para entrar.");
 toast("Sesión cerrada");
};

const audioTypes = new Set(["audio/mpeg","audio/mp3","audio/wav","audio/x-wav","audio/mp4","audio/aac","audio/ogg","audio/flac"]);
function safeName(name){return name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]/g,"_")}
function titleFromFile(name){return name.replace(/\.[^.]+$/," ").replace(/[._-]+/g," ").trim()}
function setBulkSummary(message){$("bulkSummary").textContent=message}
function drawQueue(items){
 $("bulkQueue").innerHTML=items.map((item,i)=>`<div class="queue-row" id="queue-${i}"><span class="queue-name">${escapeHtml(item.file.name)}</span><span class="queue-status pending">En espera</span></div>`).join("");
}
function updateQueue(i,status,kind="pending"){
 const row=$("queue-"+i);if(!row)return;
 const tag=row.querySelector(".queue-status");tag.textContent=status;tag.className="queue-status "+kind;
}
function setProgress(done,total){const pct=total?Math.round(done/total*100):0;$("bulkProgress").style.width=pct+"%";$("bulkProgressText").textContent=`${done} de ${total} canciones procesadas (${pct}%)`}
function selectedBatch(){
 const individual=Array.from($("bulkFiles").files||[]);
 const folder=Array.from($("folderFiles").files||[]);
 const files=folder.length?folder:individual;
 return files.map(file=>({file,relativePath:file.webkitRelativePath||file.name,fromFolder:folder.length>0}));
}

let bulkMetadataByFile = new Map();
let bulkMetadataRequest = 0;
let bulkMetadataFiles = [];

function folderAlbumForItem(item){
 const parts=item.relativePath.split("/").filter(Boolean);
 return item.fromFolder&&parts.length>1?parts[0]:"";
}

function metadataForItem(item){
 const saved=bulkMetadataByFile.get(item.file)||{};
 return {
  title:saved.title||titleFromFile(item.file.name),
  artist:saved.artistEdited?saved.artist:(saved.artist||$("bulkArtist").value.trim()||"Artista independiente"),
  album:saved.albumEdited?saved.album:($("bulkAlbum").value.trim()||saved.album||folderAlbumForItem(item)||null)
 };
}

async function prepareBulkMetadata(){
 const request=++bulkMetadataRequest;
 const batch=selectedBatch();
 const preview=$("bulkMetadataPreview");
 const rows=$("bulkMetadataRows");
 if(!preview||!rows)return;
 if(!batch.length){
  preview.classList.add("hidden");
  rows.innerHTML="";
  bulkMetadataByFile=new Map();
  bulkMetadataFiles=[];
  return;
 }
 if(batch.length===bulkMetadataFiles.length&&batch.every((item,index)=>item.file===bulkMetadataFiles[index]))return;
 preview.classList.remove("hidden");
 rows.innerHTML='<p class="muted-text">Leyendo etiquetas de las canciones…</p>';
 const next=new Map();
 const entries=await Promise.all(batch.map(async item=>{
  const supported=/\.mp3$/i.test(item.file.name);
  const tags=supported?await readAudioMetadata(item.file):{};
  return {item,tags};
 }));
 if(request!==bulkMetadataRequest)return;
 for(const {item,tags} of entries){
  next.set(item.file,{
   title:tags.title||titleFromFile(item.file.name),
   artist:tags.artist||"",
   album:tags.album||""
  });
 }
 bulkMetadataByFile=next;
 bulkMetadataFiles=batch.map(item=>item.file);
 rows.innerHTML=batch.map((item,index)=>{
  const meta=metadataForItem(item);
  const hasTags=!!(meta.artist||meta.album||meta.title!==titleFromFile(item.file.name));
  return `<article class="bulk-metadata-row" data-metadata-row="${index}">
   <div class="bulk-metadata-file"><b>${escapeHtml(item.file.name)}</b><small>${hasTags?"Datos detectados o completados":"Sin etiquetas ID3; puedes completar los datos"}</small></div>
   <label>Título<input type="text" data-meta-field="title" data-meta-index="${index}" value="${escapeAttr(meta.title)}"></label>
   <label>Artista<input type="text" data-meta-field="artist" data-meta-index="${index}" value="${escapeAttr(meta.artist)}" placeholder="Artista desconocido"></label>
   <label>Álbum<input type="text" data-meta-field="album" data-meta-index="${index}" value="${escapeAttr(meta.album||"")}" placeholder="Sin álbum"></label>
  </article>`;
 }).join("");
 rows.querySelectorAll("[data-meta-field]").forEach(input=>{
  input.addEventListener("input",()=>{
   const item=batch[Number(input.dataset.metaIndex)];
   if(!item)return;
   const saved=bulkMetadataByFile.get(item.file)||{};
   saved[input.dataset.metaField]=input.value.trim();
   saved[input.dataset.metaField+"Edited"]=true;
   bulkMetadataByFile.set(item.file,saved);
  });
 });
}
$("bulkFiles").onchange=()=>{if($("bulkFiles").files.length){$("folderFiles").value="";setBulkSummary(`${$("bulkFiles").files.length} archivo(s) seleccionados`)}};
$("folderFiles").onchange=()=>{if($("folderFiles").files.length){$("bulkFiles").value="";setBulkSummary(`${$("folderFiles").files.length} archivo(s) encontrados en la carpeta`)}};

async function uploadWithRetry(bucket,path,file,contentType){
 let lastError;
 for(let attempt=1;attempt<=3;attempt++){
  const result=await supabase.storage.from(bucket).upload(path,file,{upsert:false,contentType:contentType||file.type||"application/octet-stream"});
  if(!result.error)return result;
  lastError=result.error;
  if(attempt<3)await new Promise(resolve=>setTimeout(resolve,700*attempt));
 }
 throw lastError;
}

$("bulkUploadBtn").onclick=async()=>{
 if(!supabase)return setBulkSummary("No se pudo conectar con Supabase.");

 const batch=selectedBatch();
 if(!batch.length)return setBulkSummary("Selecciona canciones o una carpeta primero.");

 const valid=batch.filter(x=>x.file.type.startsWith("audio/")||/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(x.file.name));
 const rejected=batch.length-valid.length;

 if(!valid.length)return setBulkSummary("No encontramos archivos de audio compatibles.");

 const tooLarge=valid.filter(x=>x.file.size>100*1024*1024);
 if(tooLarge.length)return setBulkSummary(`Hay ${tooLarge.length} archivo(s) que superan 100 MB. Quita esos archivos y vuelve a intentarlo.`);

 const userResult=await supabase.auth.getUser();
 const user=userResult.data.user;
 if(userResult.error||!user)return setBulkSummary("Tu sesión venció. Cierra sesión y vuelve a entrar.");

 await prepareBulkMetadata();
 const albumTyped=$("bulkAlbum").value.trim();
 const cover=$("bulkCover").files[0]||null;

 // Comprobar canciones duplicadas
 const normalize=value=>String(value||"")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"")
  .trim()
  .toLowerCase()
  .replace(/\s+/g," ");

 const {data:existingSongs,error:checkError}=await supabase
  .from("songs")
  .select("title,artist");

 if(checkError){
  return setBulkSummary("No se pudieron comprobar los duplicados: "+checkError.message);
 }

 const seen=new Set(
  (existingSongs||[]).map(song=>
   normalize(song.title)+"|"+normalize(song.artist)
  )
 );

 const toUpload=[];
 let duplicates=0;

 for(const item of valid){
  const metadata=metadataForItem(item);
  const key=normalize(metadata.title)+"|"+normalize(metadata.artist||"Artista independiente");

  if(seen.has(key)){
   duplicates++;
   continue;
  }

  seen.add(key);
  toUpload.push({...item,metadata});
 }

 if(!toUpload.length){
  return setBulkSummary(`No se subió nada: las ${duplicates} canción(es) seleccionadas ya existen.`);
 }

 $("bulkUploadBtn").disabled=true;
 $("bulkUploadBtn").textContent="Subiendo canciones…";

 drawQueue(toUpload);
 setProgress(0,toUpload.length);
 setBulkSummary(`Preparando ${toUpload.length} canción(es). ${duplicates} duplicada(s) omitidas.`);

 let coverUrl=null,coverPath=null;

 try{
  if(cover){
   coverPath=`${user.id}/${Date.now()}-${safeName(cover.name)}`;
   await uploadWithRetry("covers",coverPath,cover,cover.type||"image/jpeg");
   coverUrl=supabase.storage.from("covers").getPublicUrl(coverPath).data.publicUrl;
  }
 }catch(error){
  $("bulkUploadBtn").disabled=false;
  $("bulkUploadBtn").textContent="Subir selección completa ↑";
  return setBulkSummary("No se pudo subir la portada: "+(error.message||"error desconocido"));
 }

 let done=0,success=0,failed=0;

 for(let i=0;i<toUpload.length;i++){
  const item=toUpload[i],file=item.file;
  updateQueue(i,"Subiendo audio…","working");

  try{
   const metadata=item.metadata||metadataForItem(item);
   const album=metadata.album||albumTyped||null;

   const megaForm=new FormData();
   megaForm.append("file",file);

   const sessionResult=await supabase.auth.getSession();
   const accessToken=sessionResult.data.session?.access_token;

   if(!accessToken){
    throw new Error("Tu sesión ha vencido. Inicia sesión nuevamente.");
   }

   const megaResponse=await fetch(
    "https://nova-mega-server.onrender.com/upload",
    {
     method:"POST",
     headers:{
      Authorization:`Bearer ${accessToken}`
     },
     body:megaForm
    }
   );

   const megaResult=await megaResponse.json();

   if(!megaResponse.ok||!megaResult.success){
    throw new Error(megaResult.error||"No se pudo subir a MEGA");
   }

   const audioUrl=megaResult.mega_url;
   const audioPath=megaResult.mega_file_id?`mega:${megaResult.mega_file_id}`:null;

   updateQueue(i,"Guardando información…","working");

   const {error}=await supabase.from("songs").insert({
    title:metadata.title,
    artist:metadata.artist||"Artista independiente",
    album,
    audio_url:audioUrl,
    audio_path:audioPath,
    cover_url:coverUrl,
    cover_path:coverPath,
    uploaded_by:user.id,
    is_published:true
   });

   if(error)throw error;

   success++;
   updateQueue(i,"Publicada ✓","done");

  }catch(error){
   failed++;
   updateQueue(i,error.message||"Error al subir","failed");
  }

  done++;
  setProgress(done,toUpload.length);
 }

 $("bulkUploadBtn").disabled=false;
 $("bulkUploadBtn").textContent="Subir selección completa ↑";

 if($("bulkFiles").files.length)$("bulkFiles").value="";
 if($("folderFiles").files.length)$("folderFiles").value="";
 $("bulkCover").value="";

 await loadTracks();

 setBulkSummary(
  `Proceso terminado: ${success} publicada(s), ${failed} con error, ${duplicates} duplicada(s) omitidas${rejected?`, ${rejected} archivo(s) ignorados`:""}.`
 );

 if(success)toast(`${success} canción(es) publicadas en NOVA MUSIC`);
};


function savePlaylists(){localStorage.setItem("nova_playlists",JSON.stringify(playlists));renderPlaylists()}
function renderPlaylists(){
 $("playlistGrid").innerHTML=playlists.length?playlists.map((p,i)=>`<div class="playlist-card"><div class="playlist-art">♫</div><div style="min-width:0"><b>${escapeHtml(p.name)}</b><small>${p.songIds.length} canciones</small></div><button data-remove-playlist="${i}" title="Eliminar">×</button></div>`).join(""):'<p class="muted-text">Todavía no tienes playlists. Crea una para guardar tus favoritas.</p>';
 document.querySelectorAll("[data-remove-playlist]").forEach(b=>b.onclick=()=>{playlists.splice(Number(b.dataset.removePlaylist),1);savePlaylists()});
}
$("createPlaylist").onclick=()=>{const name=$("playlistName").value.trim();if(!name)return toast("Escribe un nombre");playlists.push({name,songIds:[]});$("playlistName").value="";savePlaylists();closeModal("playlistModal");toast("Playlist creada")};
function addTrackToPlaylist(i){
 if(!playlists.length){toast("Primero crea una playlist");openModal("playlistModal");return}
 const choices=playlists.map((p,n)=>`${n+1}. ${p.name}`).join("\n");
 const answer=prompt("¿A qué playlist la agregamos?\n"+choices+"\nEscribe el número:");
 const n=Number(answer)-1;if(Number.isInteger(n)&&playlists[n]){if(!playlists[n].songIds.includes(tracks[i].id))playlists[n].songIds.push(tracks[i].id);savePlaylists();toast("Agregada a "+playlists[n].name)}
}
renderPlaylists();
lockMemberArea("Inicia sesión o solicita acceso para entrar a NOVA MUSIC.");
if(supabase){
 supabase.auth.onAuthStateChange((_event,session)=>{
  showSession(session);
  setTimeout(()=>{void checkMemberAccess(session);},0);
 });
 supabase.auth.getSession().then(({data})=>{
  if(data.session)checkMemberAccess(data.session);
 });
}
// NOVA MUSIC: contador previo de canciones
let bulkPrecheckRequest=0;

async function updateBulkPrecheck(){
 const box=$("bulkPrecheck");
 if(!box)return;

 const request=++bulkPrecheckRequest;
 const batch=selectedBatch();

 if(!batch.length){
  box.textContent="Selecciona canciones para comprobar cuáles son nuevas.";
  return;
 }

 if(!supabase){
  box.textContent="No se pudo conectar con Supabase.";
  return;
 }

 const valid=batch.filter(x=>
  x.file.type.startsWith("audio/")||
  /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(x.file.name)
 );

 const rejected=batch.length-valid.length;
 const tooLarge=valid.filter(x=>x.file.size>100*1024*1024);
 const eligible=valid.filter(x=>x.file.size<=100*1024*1024);

 if(!eligible.length){
  box.textContent=`Canciones nuevas: 0 | Duplicadas: 0 | Archivos no compatibles: ${rejected} | Mayores de 100 MB: ${tooLarge.length}`;
  return;
 }

 box.textContent="Comprobando canciones existentes…";

 await prepareBulkMetadata();
 const normalizeNOVA=value=>String(value||"")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"")
  .trim()
  .toLowerCase()
  .replace(/\s+/g," ");

 const {data,error}=await supabase
  .from("songs")
  .select("title,artist");

 if(request!==bulkPrecheckRequest)return;

 if(error){
  box.textContent="No se pudieron comprobar los duplicados: "+error.message;
  return;
 }

 const seen=new Set(
  (data||[]).map(song=>
   normalizeNOVA(song.title)+"|"+normalizeNOVA(song.artist)
  )
 );

 let duplicates=0;
 let newSongs=0;

 for(const item of eligible){
  const metadata=metadataForItem(item);
  const key=normalizeNOVA(metadata.title)+"|"+normalizeNOVA(metadata.artist||"Artista independiente");

  if(seen.has(key)){
   duplicates++;
  }else{
   newSongs++;
   seen.add(key);
  }
 }

 box.textContent=
  `Canciones nuevas: ${newSongs} | Duplicadas: ${duplicates} | Archivos no compatibles: ${rejected} | Mayores de 100 MB: ${tooLarge.length}`;
}

$("bulkFiles").addEventListener("change",updateBulkPrecheck);
$("folderFiles").addEventListener("change",updateBulkPrecheck);
$("bulkArtist").addEventListener("change",()=>{void prepareBulkMetadata();void updateBulkPrecheck();});
$("bulkAlbum").addEventListener("change",()=>{void prepareBulkMetadata();void updateBulkPrecheck();});
/* NOVA MUSIC - Navegación activa automática */
const novaNavItems = document.querySelectorAll(".nova-bottom-nav .nav-item");

const novaSections = [
  {selector:".nova-hero", index:0},
  {selector:"#library", index:1},
  {selector:"#favoritesSection", index:2},
  {selector:".playlist-section:not(#favoritesSection)", index:3}
];
function novaSetActive(index){
  novaNavItems.forEach((item,i)=>{
    item.classList.toggle("active",i===index);
  });
}

const novaObserver = new IntersectionObserver(entries=>{
  const visible = entries
    .filter(entry=>entry.isIntersecting)
    .sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);

  if(visible.length){
    const index = novaSections.findIndex(
      section=>document.querySelector(section.selector)===visible[0].target
    );

    if(index!==-1) novaSetActive(novaSections[index].index);
  }
},{
  rootMargin:"-15% 0px -65% 0px",
  threshold:0
});

novaSections.forEach(section=>{
  const element=document.querySelector(section.selector);
  if(element) novaObserver.observe(element);
});

novaNavItems.forEach((item,index)=>{
  item.addEventListener("click",()=>novaSetActive(index));
});
/* NOVA MUSIC - Sincronización del reproductor expandido */

function cycleSleepTimer(){
 const button=$("sleepTimerBtn");if(!button)return;
 const options=[15,30,45,60];
 if(sleepTimerTimeout){clearTimeout(sleepTimerTimeout);sleepTimerTimeout=null;}
 if(sleepTimerMinutes===0)sleepTimerMinutes=15;
 else if(sleepTimerMinutes===60)sleepTimerMinutes=0;
 else sleepTimerMinutes=options[options.indexOf(sleepTimerMinutes)+1]||0;
 if(!sleepTimerMinutes){button.textContent="⏱ Temporizador apagado";toast("Temporizador desactivado");return;}
 button.textContent="⏱ "+sleepTimerMinutes+" min";
 const selected=sleepTimerMinutes;
 sleepTimerTimeout=setTimeout(()=>{
  audio.pause();
  $("playBtn").textContent="▶";
  button.textContent="⏱ Temporizador apagado";
  sleepTimerMinutes=0;sleepTimerTimeout=null;
  toast("Temporizador: reproducción pausada");
 },selected*60*1000);
 toast("La música se pausará en "+selected+" minutos");
}
$("sleepTimerBtn").addEventListener("click",cycleSleepTimer);
audio.addEventListener("play",()=> $("novaVisualizer")?.classList.add("is-playing"));
audio.addEventListener("pause",()=> $("novaVisualizer")?.classList.remove("is-playing"));

function updateFullPlayer(){
  $("fullTitle").textContent=$("nowTitle").textContent;
  $("fullArtist").textContent=$("nowArtist").textContent;

  const cover=$("nowCover").style.backgroundImage;

  $("fullCover").style.backgroundImage=cover;
  $("fullCover").textContent=cover?"":"♫";
}

$("nowTitle").parentElement.onclick=()=>{
  $("fullPlayer").classList.remove("hidden");
  updateFullPlayer();
};

$("closeFullPlayer").onclick=()=>{
  $("fullPlayer").classList.add("hidden");
};

$("fullPlay").onclick=()=>{
  $("playBtn").click();
};

$("fullPrev").onclick=()=>{
  $("prevBtn").click();
};

$("fullNext").onclick=()=>{
  $("nextBtn").click();
};

$("fullShuffle").onclick=()=>{
  $("shuffleBtn").click();
};

$("fullRepeat").onclick=()=>{
  $("repeatBtn").click();
};

$("fullSeek").oninput=()=>{
  if(audio.duration){
    audio.currentTime=Number($("fullSeek").value)/100*audio.duration;
  }
};

audio.addEventListener("timeupdate",()=>{
  $("fullSeek").value=audio.duration?audio.currentTime/audio.duration*100:0;
  $("fullCurrentTime").textContent=time(audio.currentTime);
  $("fullDuration").textContent=time(audio.duration);
  $("fullPlay").textContent=audio.paused?"▶":"Ⅱ";
});
