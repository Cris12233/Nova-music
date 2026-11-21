import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const configured = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("PEGA_AQUI") && SUPABASE_ANON_KEY.length > 30 && !SUPABASE_ANON_KEY.includes("PEGA_AQUI");
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const $ = id => document.getElementById(id);
const audio = $("audio");
let tracks = [], currentIndex = -1, playlists = JSON.parse(localStorage.getItem("nova_playlists") || "[]");

function toast(msg){$("toast").textContent=msg;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2400)}
function time(s){if(!Number.isFinite(s))return "0:00";return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`}
function openModal(id){$(id).classList.add("open")}
function closeModal(id){$(id).classList.remove("open")}
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
$("adminOpen").onclick=()=>{openModal("adminModal");refreshSession()};
$("newPlaylist").onclick=()=>openModal("playlistModal");

function renderTracks(){
 const q=$("search").value.toLowerCase();
 const shown=tracks.filter(t=>(t.title+" "+(t.artist||"")+" "+(t.album||"")).toLowerCase().includes(q));
 $("trackCount").textContent=tracks.length;
 $("trackGrid").innerHTML=shown.length?shown.map(t=>{
  const idx=tracks.indexOf(t), cover=t.cover_url?`background-image:url('${escapeAttr(t.cover_url)}')`:"";
  const subtitle=[t.artist||"Artista independiente",t.album].filter(Boolean).join(" · ");
  return `<article class="track-card"><div class="cover" style="${cover}"><span class="cover-symbol" ${t.cover_url?'style="display:none"':''}>♫</span><button class="card-play" data-play="${idx}">▶</button></div><div class="track-info"><b>${escapeHtml(t.title)}</b><span>${escapeHtml(subtitle)}</span><div class="track-actions"><button data-play="${idx}">▶ Escuchar</button><a href="${escapeAttr(t.audio_url)}" download="${escapeAttr(t.title)}">↓ Descargar</a><button data-add="${idx}">＋ Playlist</button></div></div></article>`;
 }).join(""):`<div class="empty-state"><div class="empty-icon">♫</div><h3>${tracks.length?"No encontramos esa canción":"Tu escenario está listo"}</h3><p>${tracks.length?"Prueba con otro nombre, artista o álbum.":"Las canciones que publiques aparecerán aquí."}</p></div>`;
 document.querySelectorAll("[data-play]").forEach(b=>b.onclick=()=>playTrack(Number(b.dataset.play)));
 document.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>addTrackToPlaylist(Number(b.dataset.add)));
}
function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function escapeAttr(s=""){return escapeHtml(s)}
function playTrack(i){if(!tracks[i])return;currentIndex=i;const t=tracks[i];audio.src=t.audio_url;audio.play().catch(()=>toast("No se pudo reproducir el audio."));$("nowTitle").textContent=t.title;$("nowArtist").textContent=t.artist||"Artista independiente";$("nowCover").textContent="♫";$("nowCover").style.backgroundImage=t.cover_url?`url("${t.cover_url}")`:"";$("playBtn").textContent="Ⅱ"}
$("playBtn").onclick=()=>{if(!audio.src){if(tracks.length)playTrack(0);return}if(audio.paused){audio.play();$("playBtn").textContent="Ⅱ"}else{audio.pause();$("playBtn").textContent="▶"}};
$("prevBtn").onclick=()=>{if(tracks.length)playTrack((currentIndex-1+tracks.length)%tracks.length)};
$("nextBtn").onclick=()=>{if(tracks.length)playTrack((currentIndex+1)%tracks.length)};
audio.ontimeupdate=()=>{$("seek").value=audio.duration?audio.currentTime/audio.duration*100:0;$("currentTime").textContent=time(audio.currentTime);$("duration").textContent=time(audio.duration)};
$("seek").oninput=()=>{if(audio.duration)audio.currentTime=Number($("seek").value)/100*audio.duration};
$("volume").oninput=()=>audio.volume=Number($("volume").value);
audio.onended=()=>{if(tracks.length)playTrack((currentIndex+1)%tracks.length)};
$("search").oninput=renderTracks;

async function loadTracks(){
 if(!supabase){$("trackGrid").innerHTML='<div class="empty-state"><div class="empty-icon">⚙</div><h3>Falta conectar Supabase</h3><p>Abre README.txt y sigue los pasos para activar tu biblioteca musical.</p></div>';return}
 const {data,error}=await supabase.from("songs").select("*").order("created_at",{ascending:false});
 if(error){$("trackGrid").innerHTML=`<div class="empty-state"><h3>No se pudo cargar la biblioteca</h3><p>${escapeHtml(error.message)}</p></div>`;return}
 tracks=data||[];renderTracks();
}

async function refreshSession(){
 if(!supabase){
  $("adminMessage").textContent="Primero configura Supabase. Revisa README.txt.";
  return;
 }

 const {data}=await supabase.auth.getSession();
 showSession(data.session);

 if(data.session){
  await checkMegaStatus(data.session);
 }
}

function showSession(session){
 $("authForm").classList.toggle("hidden",!!session);
 $("uploadPanel").classList.toggle("hidden",!session);

 if(session){
  $("signedEmail").textContent=session.user.email;
 }
}

async function checkMegaStatus(session){
 $("adminMessage").textContent="Comprobando conexión con MEGA...";

 try{
  const response=await fetch(
   "https://nova-mega-server.onrender.com/mega-status",
   {
    headers:{
     Authorization:`Bearer ${session.access_token}`
    }
   }
  );

  const result=await response.json();

  if(!response.ok){
   throw new Error(result.error || "No se pudo conectar");
  }

  $("adminMessage").textContent="¡MEGA conectado correctamente!";
 }catch(error){
  $("adminMessage").textContent=
   "No se pudo comprobar MEGA: "+error.message;
 }
}

$("loginBtn").onclick=async()=>{
 if(!supabase){
  $("adminMessage").textContent="Configura Supabase primero (README.txt).";
  return;
 }

 $("adminMessage").textContent="Verificando...";

 const {data,error}=await supabase.auth.signInWithPassword({
  email:$("email").value,
  password:$("password").value
 });

 if(error){
  $("adminMessage").textContent=error.message;
  return;
 }

 if(data?.session){
  showSession(data.session);
  await checkMegaStatus(data.session);
 }
};

$("logoutBtn").onclick=async()=>{
 await supabase.auth.signOut();
 showSession(null);
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
 const artist=$("bulkArtist").value.trim()||"Artista independiente";
 const albumTyped=$("bulkAlbum").value.trim();
 const cover=$("bulkCover").files[0]||null;
 $("bulkUploadBtn").disabled=true;$("bulkUploadBtn").textContent="Subiendo canciones…";
 drawQueue(valid);setProgress(0,valid.length);
 setBulkSummary(`Preparando ${valid.length} canción(es). No cierres esta ventana.`);
 let coverUrl=null,coverPath=null;
 try{
  if(cover){
   coverPath=`${user.id}/${Date.now()}-${safeName(cover.name)}`;
   await uploadWithRetry("covers",coverPath,cover,cover.type||"image/jpeg");
   coverUrl=supabase.storage.from("covers").getPublicUrl(coverPath).data.publicUrl;
  }
 }catch(error){
  $("bulkUploadBtn").disabled=false;$("bulkUploadBtn").textContent="Subir selección completa ↑";
  return setBulkSummary("No se pudo subir la portada: "+(error.message||"error desconocido"));
 }
 let done=0,success=0,failed=0;
 for(let i=0;i<valid.length;i++){
  const item=valid[i],file=item.file;
  updateQueue(i,"Subiendo audio…","working");
  try{
   const pathParts=item.relativePath.split("/").filter(Boolean);
   const folderAlbum=item.fromFolder?(pathParts.length>1?pathParts[0]:""):"";
   const album=albumTyped||folderAlbum||null;
   const audioPath=`${user.id}/${Date.now()}-${i}-${safeName(file.name)}`;
   await uploadWithRetry("music",audioPath,file,file.type||"audio/mpeg");
   const audioUrl=supabase.storage.from("music").getPublicUrl(audioPath).data.publicUrl;
   updateQueue(i,"Guardando información…","working");
   const {error}=await supabase.from("songs").insert({
    title:titleFromFile(file.name),artist,album,audio_url:audioUrl,audio_path:audioPath,
    cover_url:coverUrl,cover_path:coverPath,uploaded_by:user.id
   });
   if(error){await supabase.storage.from("music").remove([audioPath]);throw error;}
   success++;updateQueue(i,"Publicada ✓","done");
  }catch(error){failed++;updateQueue(i,error.message||"Error al subir","failed");}
  done++;setProgress(done,valid.length);
 }
 $("bulkUploadBtn").disabled=false;$("bulkUploadBtn").textContent="Subir selección completa ↑";
 if($("bulkFiles").files.length)$("bulkFiles").value="";
 if($("folderFiles").files.length)$("folderFiles").value="";
 $("bulkCover").value="";
 await loadTracks();
 setBulkSummary(`Proceso terminado: ${success} publicada(s), ${failed} con error${rejected?`, ${rejected} archivo(s) ignorados`:""}.`);
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
renderPlaylists();loadTracks();
if(supabase)supabase.auth.onAuthStateChange((_event,session)=>showSession(session));
