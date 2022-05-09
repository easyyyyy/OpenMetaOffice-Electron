import { Modal } from "antd"
import { FC, useRef, useEffect, MutableRefObject, VideoHTMLAttributes } from "react"
import { ConversationItem } from '../../../../utils/open_im_sdk/types/index'

import { messageTypes } from "../../../../constants/messageContentType";
import { im } from "../../../../utils/"
import { CustomMsgParams } from "../../../../utils/open_im_sdk/types"

type VideoInviteModalProps = {
    cancle: () => void;
    visible: boolean;
    localVideoRef: MutableRefObject<HTMLVideoElement | null>;
    remoteVideoRef: MutableRefObject<HTMLVideoElement | null>
}

const VideoModal: FC<VideoInviteModalProps> = ({ cancle, visible, localVideoRef, remoteVideoRef }) => {
    const handerCancle = () => {
        cancle()
    }

    return (
        <Modal
            className="rtc_modal"
            width={'858px'}
            visible={visible}
            footer={null}
            closable={false}>
            <div className="rtc_body" style={{ width: '858px', height: '564px' }}>
                <div className="body_actions" style={{ justifyContent: "flex-end" }}>
                    <div className="body_actions_bottom">
                        <div className="actions">
                            <div className="bottom_actions_item">
                                <img
                                    className="rtc_action_icon"
                                    src="data:image/png;base64,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"
                                    alt=""
                                    onClick={handerCancle} />
                                <div>麦克风</div>
                            </div>
                            <div className="bottom_actions_item">
                                <img
                                    className="rtc_action_icon"
                                    src="data:image/png;base64,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"
                                    alt=""
                                    onClick={handerCancle} />
                                <div>挂断</div>
                            </div>
                            <div className="bottom_actions_item">
                                <img
                                    className="rtc_action_icon"
                                    src="data:image/png;base64,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"
                                    alt=""
                                    onClick={handerCancle} />
                                <div>摄像头</div>
                            </div>
                        </div>
                    </div>
                    <div className="body_actions_tr">
                        <video src="" ref={localVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }}></video>
                    </div>
                </div>
                <video src="" ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }}></video>
            </div>
        </Modal>
    )
}

export default VideoModal
