import { Button, Image, Layout, message, Modal } from "antd";
import { useEffect, useRef, useState, useCallback, MutableRefObject } from "react";
import { shallowEqual, useDispatch, useSelector } from "react-redux";
import { RootState } from "../../../store";
import CveList from "./CveList/CveList";
import CveFooter from "./CveFooter/CveFooter";
import CveRightBar from "./CveRightBar";
import HomeSider from "../components/HomeSider";
import HomeHeader from "../components/HomeHeader";
import { createNotification, events, getNotification, im, isSingleCve, parseMessageType } from "../../../utils";
import ChatContent from "./ChatContent";
import home_bg from "@/assets/images/home_bg.png";
import { messageTypes, notOssMessageTypes, SessionType, tipsTypes } from "../../../constants/messageContentType";
import { useReactive, useRequest } from "ahooks";
import { CbEvents } from "../../../utils/open_im_sdk";
import { DELETEMESSAGE, ISSETDRAFT, MERMSGMODAL, MUTILMSG, OPENGROUPMODAL, RESETCVE, REVOKEMSG, SENDFORWARDMSG, TOASSIGNCVE, UPDATEFRIENDCARD, VIDEOINVITE } from "../../../constants/events";
import { animateScroll } from "react-scroll";
import MerModal from "./components/MerModal";
import { SelectType } from "../components/MultipleSelectBox";
import { getGroupInfo, getGroupMemberList, setGroupMemberList } from "../../../store/actions/contacts";
import { ConversationItem, FriendItem, GroupItem, GroupMemberItem, MergeElem, MergerMsgParams, MessageItem, PictureElem, WsResponse } from "../../../utils/open_im_sdk/types";
import { useTranslation } from "react-i18next";
import { setCurCve } from "../../../store/actions/cve";
import { CustomMsgParams } from "../../../utils/open_im_sdk/types"
import VideoInviteModal from "./components/VideoInviteModal";
import VideoInvitedModal from "./components/VideoInvitedModal";
import VideoModal from "./components/VideoModal";
import AdapterJS from "adapterjs"

const { Content } = Layout;

type NMsgMap = {
  oid: string;
  mid: string;
  flag: boolean;
};

const WelcomeContent = () => {
  const { t } = useTranslation();
  const createGroup = () => {
    events.emit(OPENGROUPMODAL, "create");
  };
  return (
    <div className="content_bg">
      {/* <div className="content_bg_title">{t("CreateGroup")}</div>
      <div className="content_bg_sub">{t("CreateGroupTip")}</div>
      <img src={home_bg} alt="" />
      <Button onClick={createGroup} className="content_bg_btn" type="primary">
        {t("CreateNow")}
      </Button> */}
    </div>
  );
};

type ReactiveState = {
  historyMsgList: MessageItem[];
  typing: boolean;
  hasMore: boolean;
  merModal: boolean;
  merData: (MergeElem & { sender: string }) | undefined;
  searchStatus: boolean;
  searchCve: ConversationItem[];
  videoInviteVisable: boolean;
  videoInvitedVisable: boolean;
  videoInvitedData: any;
  videoVisable: boolean;
  videoData: any;
};

const Home = () => {
  const [visible, setVisible] = useState(false);
  const [imgGroup, setImgGroup] = useState<Array<string>>([]);
  const selectCveList = (state: RootState) => state.cve.cves;
  const cveList = useSelector(selectCveList, shallowEqual);
  const selectCveLoading = (state: RootState) => state.cve.cveInitLoading;
  const cveLoading = useSelector(selectCveLoading, shallowEqual);
  const selfID = useSelector((state: RootState) => state.user.selfInfo.userID, shallowEqual);
  const curCve = useSelector((state: RootState) => state.cve.curCve, shallowEqual);
  const groupInfo = useSelector((state: RootState) => state.contacts.groupInfo, shallowEqual);
  const dispatch = useDispatch();
  const rs = useReactive<ReactiveState>({
    historyMsgList: [],
    typing: false,
    hasMore: true,
    merModal: false,
    merData: undefined,
    searchStatus: false,
    searchCve: [],
    videoInviteVisable: false,
    videoInvitedVisable: false,
    videoInvitedData: undefined,
    videoVisable: false,
    videoData: undefined
  });
  const timer = useRef<NodeJS.Timeout | null>(null);
  const {
    loading,
    run: getMsg,
    cancel: msgCancel,
  } = useRequest(im.getHistoryMessageList, {
    manual: true,
    onSuccess: handleMsg,
    onError: (err) => message.error(t("GetChatRecordFailed")),
  });
  const { t } = useTranslation();
  let nMsgMaps: NMsgMap[] = [];
  const localVideoRef: MutableRefObject<HTMLVideoElement | null> = useRef(null)
  const remoteVideoRef: MutableRefObject<HTMLVideoElement | null> = useRef(null)
  const pcRef: MutableRefObject<RTCPeerConnection | null> = useRef(null)
  const videoDataRef: MutableRefObject<any> = useRef(null)

  const mediaStreamConstraints = {
    // video: { facingMode: { exact: 'environment' }, width: { ideal: 1080 }, height: { ideal: 1920 } }, // 开启手机后置摄像头
    video: true,
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  }
  const pcConfig: RTCConfiguration = {
    iceServers: [
      {
        'urls': 'turn:124.222.64.28:3478',
        'username': 'kurento',
        'credential': 'kurento'
      }
    ]
  }

  const offerOptions: RTCOfferOptions = {
    offerToReceiveVideo: true,
    offerToReceiveAudio: true
  }

  useEffect(() => {
    getNotification();
    return () => {
      resetCve();
    };
  }, []);

  useEffect(() => {
    im.on(CbEvents.ONRECVMESSAGEREVOKED, revokeMsgHandler);
    im.on(CbEvents.ONRECVC2CREADRECEIPT, c2cMsgHandler);
    return () => {
      im.off(CbEvents.ONRECVMESSAGEREVOKED, revokeMsgHandler);
      im.off(CbEvents.ONRECVC2CREADRECEIPT, c2cMsgHandler);
    };
  }, []);

  useEffect(() => {
    events.on(RESETCVE, resetCve);
    events.on(DELETEMESSAGE, deleteMsg);
    events.on(REVOKEMSG, revokeMyMsgHandler);
    events.on(MERMSGMODAL, merModalHandler);
    events.on(VIDEOINVITE, setVideoInvite)
    window.electron && window.electron.addIpcRendererListener("DownloadFinish", downloadFinishHandler, "downloadListener");
    return () => {
      events.off(RESETCVE, resetCve);
      events.off(DELETEMESSAGE, deleteMsg);
      events.off(REVOKEMSG, revokeMyMsgHandler);
      events.off(MERMSGMODAL, merModalHandler);
      window.electron && window.electron.removeIpcRendererListener("downloadListener");
    };
  }, []);

  useEffect(() => {
    events.on(SENDFORWARDMSG, sendForwardHandler);
    events.on(TOASSIGNCVE, assignHandler);
    im.on(CbEvents.ONRECVNEWMESSAGE, newMsgHandler);
    return () => {
      events.off(SENDFORWARDMSG, sendForwardHandler);
      events.off(TOASSIGNCVE, assignHandler);
      im.off(CbEvents.ONRECVNEWMESSAGE, newMsgHandler);
    };
  }, [curCve]);

  //  event hander
  const setVideoInvite = async (uid: string) => {
    rs.videoInviteVisable = true
    const CustomData: CustomMsgParams = {
      data: JSON.stringify({
        type: 'invite'
      }),
      extension: "",
      description: "video"
    }
    const { data } = await im.createCustomMessage(CustomData);
    sendMsg(data, messageTypes.CUSTOMMESSAGE, uid, "")
  }

  const merModalHandler = (el: MergeElem, sender: string) => {
    rs.merData = { ...el, sender };
    rs.merModal = true;
  };

  const assignHandler = (id: string, type: SessionType) => {
    getOneCve(id, type)
      .then((cve) => clickItem(cve))
      .catch((err) => message.error(t("GetCveFailed")));
  };

  const sendForwardHandler = (options: string | MergerMsgParams, type: messageTypes, list: SelectType[]) => {
    list.map(async (s) => {
      const uid = (s as FriendItem).userID ?? "";
      const gid = (s as GroupItem).groupID ?? "";
      let data;
      if (type === messageTypes.MERGERMESSAGE) {
        data = await im.createMergerMessage(options as MergerMsgParams);
      } else {
        data = await im.createForwardMessage(options as string);
      }
      sendMsg(data.data, type, uid, gid);
      events.emit(MUTILMSG, false);
    });
  };

  // video handler
  const videoHandler = (data: MessageItem, videoData: any) => {
    switch (videoData?.type) {
      case "invite":
        rs.videoInvitedVisable = true
        rs.videoInvitedData = {
          sendID: data?.sendID,
          senderNickname: data?.senderNickname,
          senderFaceUrl: data?.senderFaceUrl,
          isCreatedOffer: false,
        }
        console.log(222)
        break
      case "agree":
        rs.videoInviteVisable = false
        rs.videoVisable = true
        videoDataRef.current = {
          sendID: data?.sendID,
          senderNickname: data?.senderNickname,
          senderFaceUrl: data?.senderFaceUrl,
          isCreatedOffer: true,
        }
        getUserMediaAdapter()
        break
      case "pc message":
        console.log('客户端收到了pc的消息', videoData?.data)
        signalingMessageCallback(videoData?.data)
        break
    }
  }

  const getUserMediaAdapter = () => {
    AdapterJS.webRTCReady(() => {
      /* eslint-disable */
      // @ts-ignore
      getUserMedia(mediaStreamConstraints, (stream) => {
        const localVideo = localVideoRef.current
        localVideo!.srcObject = stream
        console.log('赋值本地流')
        createPeerConnection(stream)
      }, (err: any) => {
        console.log(err)
      })
    })
  }

  const createPeerConnection = (stream: any) => {
    const pc = new RTCPeerConnection(pcConfig)
    pcRef.current = pc
    pc.addEventListener('icecandidate', event => {
      console.log('icecandidate event:', event)
      if (event.candidate) {
        sendPcMessage({
          type: 'candidate',
          label: event.candidate.sdpMLineIndex,
          id: event.candidate.sdpMid,
          candidate: event.candidate.candidate
        })
      } else {
        console.log('candidates结束')
      }
    })
    // pc.addEventListener('track', (event) => {
    //   console.log('track')
    //   handleRemoteMediaStreamAdded(event)
    // })
    // for (const track of stream.getTracks()) {
    //   pc.addTrack(track);
    // }
    pc.addEventListener('addstream', (event) => {
      console.log('addstream')
      handleRemoteMediaStreamAdded(event)
    })
    // @ts-ignore
    pc!.addStream(stream)
    console.log(videoDataRef.current)
    if(videoDataRef.current?.isCreatedOffer) {
      pc.createOffer(offerOptions).then((description: RTCSessionDescriptionInit) => {
        pc.setLocalDescription(description).then(() => {
          sendPcMessage(pc.localDescription)
          console.log('创建offer,生成本地会话描述')
        }).catch((err) => {
          console.log(err)
        })
      }).catch((err) => {
        console.log(err)
      })
    }
  }

  // A和B建立连接，A和C建立连接，收到的B和C的消息需要进行区分
  const signalingMessageCallback = (message: any) => {
    message = message.pcMsg
    const pc = pcRef.current
    if(!pc) return
    if (message.type === 'offer') {
      console.log('signalingMessageCallback offer', message)
      pc.setRemoteDescription(new RTCSessionDescription(message)).then(() => {
        pc.createAnswer()
          .then((description) => {
            pc.setLocalDescription(description).then(() => {
              sendPcMessage(pc.localDescription)
            }).catch((err) => {console.log(err)})
          })
          .catch((err) => { console.warn(err) })
      }).catch((err) => { console.warn(err) })
    } else if (message.type === 'answer') {
      console.log('收到了answer')
      console.log('pc', pc)
      pc.setRemoteDescription(new RTCSessionDescription(message)).catch((err) => {console.log(err)})
    } else if (message.type === 'candidate') {
      let candidate = new RTCIceCandidate({
        sdpMLineIndex: message.label,
        candidate: message.candidate
      })
      pc.addIceCandidate(candidate).catch(err => {
        console.log('addIceCandidate-error', err)
      })
    }
  }

  const sendPcMessage = async (PcMessage: any) => {
    const CustomData: CustomMsgParams = {
      data: JSON.stringify({
        type: 'pc message',
        data: {
          pcMsg: PcMessage
        }
      }),
      extension: "",
      description: "video"
    }
    const { data } = await im.createCustomMessage(CustomData);
    sendMsg(data, messageTypes.CUSTOMMESSAGE, videoDataRef.current?.sendID, "")
  }

  const handleRemoteMediaStreamAdded = (ev: any) => {
    const remoteVideo = remoteVideoRef.current
    // @ts-ignore
    remoteVideo.srcObject = ev.stream
    // if (ev.streams && ev.streams[0]) {
    //   remoteVideo!.srcObject = ev.streams[0];
    // }
  }

  //  im hander
  const newMsgHandler = (data: WsResponse) => {
    const jsonData = JSON.parse(data.data)
    console.log(jsonData)
    if (jsonData?.customElem?.description === 'video') {
      videoHandler(jsonData, JSON.parse(jsonData?.customElem?.data))
    }
    const newServerMsg: MessageItem = JSON.parse(data.data);
    if (newServerMsg.contentType !== messageTypes.TYPINGMESSAGE && newServerMsg.sendID !== selfID) {
      createNotification(newServerMsg, (id, sessionType) => {
        assignHandler(id, sessionType);
        window.electron ? window.electron.focusHomePage() : window.focus();
      });
    }
    if (curCve) {
      if (inCurCve(newServerMsg)) {
        if (newServerMsg.contentType === messageTypes.TYPINGMESSAGE) {
          typingUpdate();
        } else {
          if (newServerMsg.contentType === messageTypes.REVOKEMESSAGE) {
            rs.historyMsgList = [newServerMsg, ...rs.historyMsgList.filter((ms) => ms.clientMsgID !== newServerMsg.content)];
          } else {
            rs.historyMsgList = [newServerMsg, ...rs.historyMsgList];
          }
          markCveHasRead(curCve, 1);
        }
      }
    }
  };

  const revokeMsgHandler = (data: WsResponse) => {
    const idx = rs.historyMsgList.findIndex((m) => m.clientMsgID === data.data);
    if (idx > -1) {
      rs.historyMsgList.splice(idx, 1);
    }
  };

  const c2cMsgHandler = (data: WsResponse) => {
    JSON.parse(data.data).map((cr: any) => {
      cr.msgIDList.map((crt: string) => {
        rs.historyMsgList.find((hism) => {
          if (hism.clientMsgID === crt) {
            hism.isRead = true;
          }
        });
      });
    });
  };

  //  ipc hander
  const downloadFinishHandler = (ev: any, state: "completed" | "cancelled" | "interrupted") => {
    switch (state) {
      case "completed":
        message.success("下载成功！");
        break;
      case "cancelled":
        message.warn("下载已取消！");
        break;
      case "interrupted":
        message.error("下载失败！");
        break;
      default:
        break;
    }
  };

  const inCurCve = (newServerMsg: MessageItem): boolean => {
    const isCurSingle = newServerMsg.sendID === curCve?.userID || (newServerMsg.sendID === selfID && newServerMsg.recvID === curCve?.userID);
    return newServerMsg.sessionType === SessionType.SINGLECVE ? isCurSingle : newServerMsg.groupID === curCve?.groupID;
  };

  const resetCve = () => {
    console.log(2134);

    dispatch(setCurCve(null));
  };

  const deleteMsg = (mid: string) => {
    const idx = rs.historyMsgList.findIndex((h) => h.clientMsgID === mid);
    let tmpList = [...rs.historyMsgList];
    tmpList.splice(idx, 1);
    rs.historyMsgList = tmpList;
    message.success(t("DeleteMessageSuc"));
  };

  const revokeMyMsgHandler = (mid: string) => {
    const idx = rs.historyMsgList.findIndex((h) => h.clientMsgID === mid);
    rs.historyMsgList[idx].contentType = tipsTypes.REVOKEMESSAGE;
  };

  const typingUpdate = () => {
    rs.typing = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      rs.typing = false;
    }, 1000);
  };

  const clickItem = (cve: ConversationItem) => {
    if (cve.conversationID === curCve?.conversationID) return;

    if (curCve) {
      events.emit(ISSETDRAFT, curCve);
    }
    rs.historyMsgList = [];
    dispatch(setCurCve(cve));
    rs.hasMore = true;
    getInfo(cve);
    msgCancel();
    setImgGroup([]);
    getHistoryMsg(cve.userID, cve.groupID);
    markCveHasRead(cve);
  };

  const getInfo = (cve: ConversationItem) => {
    if (!isSingleCve(cve)) {
      dispatch(getGroupInfo(cve.groupID));
      const options = {
        groupID: cve.groupID,
        offset: 0,
        filter: 0,
        count: 2000,
      };
      dispatch(getGroupMemberList(options));
    }
  };

  const markCveHasRead = (cve: ConversationItem, type?: number) => {
    if (cve.unreadCount === 0 && !type) return;
    if (isSingleCve(cve)) {
      markC2CHasRead(cve.userID, []);
    } else {
      im.markGroupMessageHasRead(cve.groupID);
    }
  };

  const getOneCve = (sourceID: string, sessionType: number): Promise<ConversationItem> => {
    return new Promise((resolve, reject) => {
      im.getOneConversation({ sourceID, sessionType })
        .then((res) => resolve(JSON.parse(res.data)))
        .catch((err) => reject(err));
    });
  };

  const markC2CHasRead = (userID: string, msgIDList: string[]) => {
    im.markC2CMessageAsRead({ userID, msgIDList });
  };

  const getHistoryMsg = (uid?: string, gid?: string, sMsg?: MessageItem) => {
    console.log("getMsg:::");

    const config = {
      userID: uid ?? "",
      groupID: gid ?? "",
      count: 20,
      startClientMsgID: sMsg?.clientMsgID ?? "",
    };
    getMsg(config);
  };

  function handleMsg(res: WsResponse) {
    if (JSON.parse(res.data).length === 0) {
      rs.hasMore = false;
      return;
    }
    if (JSON.stringify(rs.historyMsgList[rs.historyMsgList.length - 1]) == JSON.stringify(JSON.parse(res.data).reverse()[0])) {
      rs.historyMsgList.pop();
    }
    rs.historyMsgList = [...rs.historyMsgList, ...JSON.parse(res.data).reverse()];
    console.log(rs.historyMsgList);

    rs.hasMore = !(JSON.parse(res.data).length < 20);
  }

  const imgClick = (el: PictureElem) => {
    const url = el.bigPicture.url !== "" ? el.bigPicture.url : el.sourcePicture.url;
    let tmpArr = imgGroup;
    const idx = tmpArr.findIndex((t) => t === url);
    if (idx > -1) tmpArr.splice(idx, 1);

    tmpArr.push(url);
    setImgGroup(tmpArr);
    setVisible(true);
  };

  const uuid = () => {
    return (Math.random() * 36).toString(36).slice(2) + new Date().getTime().toString();
  };

  const scrollToBottom = (duration?: number) => {
    animateScroll.scrollTo(0, {
      duration: duration ?? 350,
      smooth: true,
      containerId: "scr_container",
    });
  };

  const sendMsg = (nMsg: string, type: messageTypes, uid?: string, gid?: string) => {
    const operationID = uuid();
    if ((uid && curCve?.userID === uid) || (gid && curCve?.groupID === gid) || (!uid && !gid)) {
      const parsedMsg = JSON.parse(nMsg);
      const tMsgMap = {
        oid: operationID,
        mid: parsedMsg.clientMsgID,
        flag: false,
      };
      nMsgMaps = [...nMsgMaps, tMsgMap];
      parsedMsg.status = 2;
      rs.historyMsgList = [parsedMsg, ...rs.historyMsgList];
      setTimeout(() => {
        const item = nMsgMaps.find((n) => n.mid === parsedMsg.clientMsgID);
        if (item && !item.flag) {
          rs.historyMsgList.find((h) => {
            if (h.clientMsgID === item.mid) {
              h.status = 1;
            }
          });
        }
      }, 2000);
      scrollToBottom();
    }
    const offlinePushInfo = {
      title: "你有一条新消息",
      desc: "",
      ex: "",
      iOSPushSound: "+1",
      iOSBadgeCount: true,
    };
    const sendOption = {
      recvID: uid ?? curCve!.userID,
      groupID: gid ?? curCve!.groupID,
      offlinePushInfo,
      message: nMsg,
    };
    nMsgMaps = nMsgMaps.filter((f) => !f.flag);
    if (notOssMessageTypes.includes(type)) {
      im.sendMessageNotOss(sendOption, operationID)
        .then((res) => sendMsgCB(res, type))
        .catch((err) => sendMsgCB(err, type, true));
    } else {
      im.sendMessage(sendOption, operationID)
        .then((res) => sendMsgCB(res, type))
        .catch((err) => sendMsgCB(err, type, true));
    }
  };

  const sendMsgCB = (res: WsResponse, type: messageTypes, err?: boolean) => {
    nMsgMaps.map((tn) => {
      if (tn.oid === res.operationID) {
        const idx = rs.historyMsgList.findIndex((his) => his.clientMsgID === tn?.mid);
        if (idx !== -1) {
          tn.flag = true;
          err ? (rs.historyMsgList[idx].status = 3) : (rs.historyMsgList[idx] = JSON.parse(res.data));
        }
      }
    });
    if (type === messageTypes.MERGERMESSAGE) message.success(t("ForwardSuccessTip"));
  };

  const closeMer = () => {
    rs.merModal = false;
  };

  const siderSearch = (value: string) => {
    if (value) {
      rs.searchStatus = true;
      rs.searchCve = cveList.filter((c) => c.conversationID.indexOf(value) > -1 || c.showName.indexOf(value) > -1);
    } else {
      rs.searchCve = [];
      rs.searchStatus = false;
    }
  };

  const handlerVideoInviteCancle = () => {
    rs.videoInviteVisable = false
  }

  const handlerVideoInvitedAccept = async (videoInvitedData: any) => {
    rs.videoInvitedVisable = false
    rs.videoVisable = true
    getUserMediaAdapter()
    const CustomData: CustomMsgParams = {
      data: JSON.stringify({
        type: 'agree'
      }),
      extension: "",
      description: "video"
    }
    const { data } = await im.createCustomMessage(CustomData);
    sendMsg(data, messageTypes.CUSTOMMESSAGE, videoInvitedData?.sendID, "")
  }

  const handlerVideoInvitedReject = () => {
    rs.videoInvitedVisable = false
  }

  const handlerVideoCancle = () => {
    rs.videoVisable = false
  }

  return (
    <>
      <HomeSider searchCb={siderSearch}>
        <CveList curCve={curCve} loading={cveLoading} cveList={rs.searchStatus ? rs.searchCve : cveList} clickItem={clickItem} />
      </HomeSider>
      <Layout>
        {curCve && <HomeHeader ginfo={groupInfo} typing={rs.typing} curCve={curCve} type="chat" />}

        <Content id="chat_main" className={`total_content`}>
          {curCve ? (
            <ChatContent loadMore={getHistoryMsg} loading={loading} msgList={rs.historyMsgList} imgClick={imgClick} hasMore={rs.hasMore} curCve={curCve} />
          ) : (
            <WelcomeContent />
          )}
          <div style={{ display: "none" }}>
            <Image.PreviewGroup
              preview={{
                visible,
                onVisibleChange: (vis) => setVisible(vis),
                current: imgGroup.length - 1,
              }}
            >
              {imgGroup.map((img) => (
                <Image key={img} src={img} />
              ))}
            </Image.PreviewGroup>
          </div>
          {rs.merModal && <MerModal visible={rs.merModal} close={closeMer} curCve={curCve!} imgClick={imgClick} info={rs.merData!} />}
        </Content>

        {curCve && <CveFooter curCve={curCve} sendMsg={sendMsg} />}
      </Layout>
      {/* {curCve && <CveRightBar curCve={curCve} />} */}
      {rs.videoInviteVisable && curCve && <VideoInviteModal cancle={handlerVideoInviteCancle} visible={rs.videoInviteVisable} curCve={curCve}></VideoInviteModal>}
      {rs.videoInvitedVisable && rs.videoInvitedData && <VideoInvitedModal reject={handlerVideoInvitedReject} accept={handlerVideoInvitedAccept} visible={rs.videoInvitedVisable} videoInvitedData={rs.videoInvitedData}></VideoInvitedModal>}
      {rs.videoVisable && <VideoModal cancle={handlerVideoCancle} visible={rs.videoVisable} localVideoRef={localVideoRef} remoteVideoRef={remoteVideoRef}></VideoModal>}
    </>
  );
};

export default Home;
